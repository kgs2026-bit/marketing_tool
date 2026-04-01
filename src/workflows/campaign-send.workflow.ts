import { sleep, fetch as workflowFetch } from "workflow";
import { FatalError, RetryableError } from "workflow";
import { Resend } from "resend";

// Helper: Normalize URL to avoid double slashes
function normalizeUrl(base: string, path: string): string {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path
  return `${normalizedBase}/${normalizedPath}`
}

// Helper: Escape special regex characters in a string
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Helper: PostgREST call (used inside steps)
async function postgrest(path: string, method: string = 'GET', body?: any, headers: Record<string, string> = {}) {
  "use step";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const url = `${supabaseUrl}${path}`;
  const defaultHeaders: Record<string, string> = {
    'Authorization': `Bearer ${supabaseKey}`,
    'apikey': supabaseKey,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };

  const response = await workflowFetch(url, {
    method,
    headers: { ...defaultHeaders, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PostgREST error ${response.status}: ${errorText}`);
  }

  return response.json();
}

// Step: fetch campaign
async function fetchCampaignStep(campaignId: string) {
  "use step";
  const data = await postgrest(
    `/rest/v1/campaigns?id=eq.${campaignId}&select=*,templates(id,name,subject,html_content),campaign_recipients(id,email,contact_id,contacts(id,email,first_name,last_name,company))`,
    'GET'
  );
  if (!data || data.length === 0) {
    throw new FatalError(`Campaign not found: ${campaignId}`);
  }
  return data[0];
}

// Step: fetch auth user
async function fetchAuthUserStep(userId: string) {
  "use step";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const response = await workflowFetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Auth API error ${response.status}`);
  }

  return response.json();
}

// Step: update campaign status
async function updateCampaignStatusStep(campaignId: string, status: string, sentAt?: string) {
  "use step";
  const body: any = { status };
  if (sentAt) body.sent_at = sentAt;
  await postgrest(`/rest/v1/campaigns?id=eq.${campaignId}`, 'PATCH', body);
}

// Step: send single email (all I/O in step)
async function sendSingleEmailStep(
  campaignId: string,
  recipient: any,
  appUrl: string,
  campaign: any,
  senderName: string,
  userEmail: string,
  current: number,
  total: number
) {
  "use step";

  console.log(`[Workflow] Sending ${current}/${total}: ${recipient.email}`);

  try {
    // Fetch contact
    const contactData = await postgrest(
      `/rest/v1/contacts?id=eq.${recipient.contact_id}&select=*`,
      'GET'
    );
    const contact = contactData[0];

    // Personalize content
    let htmlContent = campaign.templates?.html_content || campaign.html_content || "";
    const trackingPixel = `<img src="${normalizeUrl(appUrl, `/api/track/open/${recipient.id}`)}" width="1" height="1" alt="" style="display:none;" />`;

    if (htmlContent.includes("</body>")) {
      htmlContent = htmlContent.replace("</body>", `${trackingPixel}</body>`);
    } else if (htmlContent.includes("</html>")) {
      htmlContent = htmlContent.replace("</html>", `${trackingPixel}</html>`);
    } else {
      htmlContent = htmlContent + trackingPixel;
    }

    let personalizedContent = htmlContent;
    if (contact) {
      personalizedContent = personalizedContent.replace(/\{\{first_name\}\}/g, contact.first_name || "");
      personalizedContent = personalizedContent.replace(/\{\{last_name\}\}/g, contact.last_name || "");
      personalizedContent = personalizedContent.replace(/\{\{email\}\}/g, contact.email || "");
      personalizedContent = personalizedContent.replace(/\{\{company\}\}/g, contact.company || "");
    }
    personalizedContent = personalizedContent.replace(/\{\{unsubscribe_link\}\}/g, `<a href="${normalizeUrl(appUrl, `/api/unsubscribe/${recipient.id}`)}" style="color: #6b7280; text-decoration: underline;">unsubscribe here</a>`);

    // Click tracking - track ALL URLs (href + plain text)
    const urlMap = new Map<string, string>();

    // 1. Find all URLs in href attributes
    const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
    let hrefMatch;
    while ((hrefMatch = hrefRegex.exec(personalizedContent)) !== null) {
      const url = hrefMatch[1];
      if (url.startsWith("http") && !urlMap.has(url)) {
        const trackingId = crypto.randomUUID();
        urlMap.set(url, trackingId);
      }
    }

    // 2. Find plain text URLs (outside HTML tags)
    // Mask all tags to avoid matching URLs inside tag attributes
    const tags: string[] = [];
    const withoutTags = personalizedContent.replace(/<[^>]*>/g, (tag: string) => {
      tags.push(tag);
      return `__TAG_${tags.length - 1}__`;
    });
    const plainUrlRegex = /https?:\/\/[^\s<>"']+/gi;
    let plainMatch;
    while ((plainMatch = plainUrlRegex.exec(withoutTags)) !== null) {
      const url = plainMatch[0];
      if (!urlMap.has(url)) {
        const trackingId = crypto.randomUUID();
        urlMap.set(url, trackingId);
      }
    }

    console.log(`[Workflow] Found ${urlMap.size} unique URLs to track (href + plain text)`);

    // Create tracking link records in DB
    const trackingLinksToCreate = Array.from(urlMap.entries()).map(([url, trackingId]) => ({
      tracking_id: trackingId,
      campaign_recipient_id: recipient.id,
      original_url: url,
      click_count: 0,
      created_at: new Date().toISOString(),
    }));

    if (trackingLinksToCreate.length > 0) {
      try {
        await postgrest('/rest/v1/tracking_links', 'POST', trackingLinksToCreate);
        console.log(`[Workflow] Created ${trackingLinksToCreate.length} tracking links in DB`);
      } catch (err: any) {
        console.error(`[Workflow] Failed to create tracking links:`, err.message);
      }
    } else {
      console.log(`[Workflow] No tracking links created (no URLs found)`);
    }

    // 3. Replace href attributes with tracking URLs
    // Sort URLs by length descending to avoid partial replacements
    const sortedUrls = Array.from(urlMap.keys()).sort((a, b) => b.length - a.length);
    let hrefReplacedCount = 0;
    for (const url of sortedUrls) {
      const trackingId = urlMap.get(url)!;
      const trackingUrl = normalizeUrl(appUrl, `/api/track/click/${trackingId}`);
      const count1 = (personalizedContent.match(new RegExp(`href="${url}"`, 'g')) || []).length;
      const count2 = (personalizedContent.match(new RegExp(`href='${url}'`, 'g')) || []).length;
      personalizedContent = personalizedContent.replaceAll(`href="${url}"`, `href="${trackingUrl}"`);
      personalizedContent = personalizedContent.replaceAll(`href='${url}'`, `href="${trackingUrl}"`);
      hrefReplacedCount += count1 + count2;
    }
    console.log(`[Workflow] Replaced ${hrefReplacedCount} href occurrences with tracking URLs`);

    // 4. Replace plain text URLs with clickable tracking links (outside tags)
    // Mask tags again in the current personalizedContent (after href replacements)
    const tags2: string[] = [];
    let withoutTags2 = personalizedContent.replace(/<[^>]*>/g, (tag: string) => {
      tags2.push(tag);
      return `__TAG_${tags2.length - 1}__`;
    });

    let plainReplacedCount = 0;
    for (const url of sortedUrls) {
      const trackingId = urlMap.get(url)!;
      const trackingUrl = normalizeUrl(appUrl, `/api/track/click/${trackingId}`);
      // Use regex to replace all occurrences (case-insensitive)
      const regex = new RegExp(escapeRegex(url), 'gi');
      const matches = withoutTags2.match(regex) || [];
      if (matches.length > 0) {
        plainReplacedCount += matches.length;
        withoutTags2 = withoutTags2.replace(regex, `<a href="${trackingUrl}">${url}</a>`);
      }
    }

    // Unmask tags
    personalizedContent = withoutTags2.replace(/__TAG_(\d+)__/g, (match: string, idx: string) => tags2[parseInt(idx)]);
    console.log(`[Workflow] Replaced ${plainReplacedCount} plain text URL occurrences with tracking links`);
    console.log(`[Workflow] Final HTML length: ${personalizedContent.length} chars`);

    // Send email
    const subject = (campaign.templates?.subject || campaign.subject || "").replace(/\{\{first_name\}\}/g, contact?.first_name || "");
    const fromAddress = userEmail ? `${senderName} <${userEmail}>` : `${senderName} <${process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"}>`;

    const resend = new Resend(process.env.RESEND_API_KEY!);
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [recipient.email],
      subject,
      html: personalizedContent,
      headers: {
        "X-Campaign-ID": campaignId,
        "X-Recipient-ID": recipient.id,
      },
    });

    if (error) throw error;

    console.log(`[Workflow] Email sent to ${recipient.email}, message_id: ${data.id}`);

    // Update recipient as delivered
    await postgrest(`/rest/v1/campaign_recipients?id=eq.${recipient.id}`, 'PATCH', {
      status: "delivered",
      sent_at: new Date().toISOString(),
      delivered_at: new Date().toISOString(),
      message_id: data.id,
    });

    return { success: true, recipientId: recipient.id, messageId: data.id };
  } catch (err: any) {
    console.error(`[Workflow] Failed for ${recipient.email}:`, err.message);

    if (err.message?.includes("rate") || err.message?.includes("429")) {
      throw new RetryableError(`Rate limited: ${err.message}`, { retryAfter: "30s" });
    }

    // Update recipient as bounced
    try {
      await postgrest(`/rest/v1/campaign_recipients?id=eq.${recipient.id}`, 'PATCH', {
        status: "bounced",
        bounced_at: new Date().toISOString(),
        bounce_reason: err.message,
      });
    } catch (updateErr: any) {
      console.error(`[Workflow] Failed to update bounce status:`, updateErr.message);
    }

    return { success: false, email: recipient.email, error: err.message };
  }
}

// Main workflow - contains loop and sleep
export async function sendCampaignWorkflow(campaignId: string) {
  "use workflow";

  console.log('[Workflow] === START ===');
  console.log('[Workflow] NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING');
  console.log('[Workflow] SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING');
  console.log('[Workflow] NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL);
  console.log('[Workflow] ===============');

  // Fetch campaign (step)
  const campaign = await fetchCampaignStep(campaignId);
  console.log(`[Workflow] Campaign: ${campaign.name}, recipients: ${campaign.campaign_recipients?.length || 0}`);

  // Filter recipients
  const recipientsToSend = (campaign.campaign_recipients || []).filter((recipient: any) => {
    const contact = recipient.contacts;
    return contact?.status !== "unsubscribed";
  });

  console.log(`[Workflow] Filtered recipients: ${recipientsToSend.length}`);

  if (recipientsToSend.length === 0) {
    await updateCampaignStatusStep(campaignId, "sent", new Date().toISOString());
    return { success: true, sent: 0, failed: 0, total: 0 };
  }

  // Get auth user (step)
  const authUser = await fetchAuthUserStep(campaign.user_id);
  const userEmail = authUser?.email || "";
  const senderName =
    campaign.sender_name ||
    authUser?.user_metadata?.full_name ||
    authUser?.user_metadata?.name ||
    (userEmail ? userEmail.split("@")[0] : "User");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const results: any[] = [];
  let consecutiveFailures = 0;
  const maxConsecutiveFailures = 10;

  // Loop at workflow level
  for (let i = 0; i < recipientsToSend.length; i++) {
    const recipient = recipientsToSend[i];
    const current = i + 1;
    const total = recipientsToSend.length;

    try {
      // Send email (step)
      const result = await sendSingleEmailStep(campaignId, recipient, appUrl, campaign, senderName, userEmail, current, total);
      results.push(result);

      if (result.success) {
        consecutiveFailures = 0;
      } else {
        consecutiveFailures++;
      }

      if (consecutiveFailures >= maxConsecutiveFailures) {
        throw new FatalError(`${maxConsecutiveFailures} consecutive failures`);
      }

      // Delay before next email (workflow level) - 30-60 seconds for testing
      if (i < recipientsToSend.length - 1) {
        const delaySeconds = 30 + Math.random() * 30;
        console.log(`[Workflow] Sleeping for ${Math.floor(delaySeconds)} seconds...`);
        await sleep(`${Math.floor(delaySeconds)}s`);
        console.log(`[Workflow] Awake, continuing...`);
      }
    } catch (err: any) {
      console.error(`[Workflow] Failed for ${recipient.email}:`, err.message);

      if (err.message?.includes("rate") || err.message?.includes("429")) {
        throw new RetryableError(`Rate limited: ${err.message}`, { retryAfter: "30s" });
      }

      results.push({ success: false, email: recipient.email, error: err.message });
      consecutiveFailures++;

      if (consecutiveFailures >= maxConsecutiveFailures) {
        throw new FatalError(`${maxConsecutiveFailures} consecutive failures`);
      }

      // Delay after failure too (unless last)
      if (i < recipientsToSend.length - 1) {
        const delaySeconds = 30 + Math.random() * 30;
        console.log(`[Workflow] Sleeping ${Math.floor(delaySeconds)} seconds after failure...`);
        await sleep(`${Math.floor(delaySeconds)}s`);
      }
    }
  }

  // Final status update (step)
  await updateCampaignStatusStep(campaignId, "sent", new Date().toISOString());

  console.log('[Workflow] === COMPLETE ===');
  return {
    success: true,
    sent: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    total: recipientsToSend.length,
    results,
  };
}
