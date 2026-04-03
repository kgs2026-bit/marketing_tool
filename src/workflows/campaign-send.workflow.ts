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

    // CRITICAL CHECK: Look for any __TAG_* placeholders in the ORIGINAL template
    const originalTags = htmlContent.match(/__TAG_\d+__/g) || [];
    if (originalTags.length > 0) {
      console.error(`[Workflow] CRITICAL: Template already contains ${originalTags.length} __TAG_* placeholders!`);
      console.error(`[Workflow] First few:`, originalTags.slice(0, 5));
      console.error(`[Workflow] This indicates the template HTML is corrupted or was previously processed by another system.`);
      // Log context around these placeholders
      originalTags.slice(0, 3).forEach((tag, i) => {
        const idx = htmlContent.indexOf(tag);
        const context = htmlContent.substring(Math.max(0, idx - 100), Math.min(htmlContent.length, idx + tag.length + 100));
        console.error(`[Workflow] Context for placeholder ${i + 1}: ...${context}...`);
      });
    }

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

    // DEBUG: Log sample of content before URL processing
    console.log(`[Workflow] Content before URL processing (first 500 chars):`);
    console.log(personalizedContent.substring(0, 500));
    // Check if content already contains bad tags
    const earlyTags = (personalizedContent.match(/__TAG_\d+__/g) || []).length;
    if (earlyTags > 0) {
      console.error(`[Workflow] WARNING: Content already contains ${earlyTags} __TAG_* placeholders BEFORE URL processing!`);
    }

    // Click tracking - track ALL URLs (href + plain text)
    const urlMap = new Map<string, string>();

    // Step 1: Mask all HTML tags ONCE with a consistent tagging system
    const tags: string[] = [];
    const maskedContent = personalizedContent.replace(/<[^>]*>/g, (tag: string) => {
      tags.push(tag);
      return `__TAG_${tags.length - 1}__`;
    });

    // Step 2: Find all URLs in the masked content
    // 2a. Find URLs in href attributes (need to look inside tag placeholders)
    // We need to check the original tags for href attributes
    for (const tag of tags) {
      const hrefMatch = /href\s*=\s*["']([^"']+)["']/i.exec(tag);
      if (hrefMatch) {
        const url = hrefMatch[1];
        if (url.startsWith("http") && !urlMap.has(url)) {
          const trackingId = crypto.randomUUID();
          urlMap.set(url, trackingId);
        }
      }
    }

    // 2b. Find plain text URLs in the masked content
    // IMPORTANT: URL must end at whitespace, tag boundary, or punctuation - NOT capture following template tags
    const plainUrlRegex = /https?:\/\/[^\s<>"'`{}[\]]+/gi;
    let plainMatch;
    while ((plainMatch = plainUrlRegex.exec(maskedContent)) !== null) {
      const url = plainMatch[0];
      // Validate that the URL doesn't contain template syntax or HTML entities
      if (!url.includes('{{') && !url.includes('{%') && !url.includes('__TAG_') && !url.includes('&')) {
        if (!urlMap.has(url)) {
          const trackingId = crypto.randomUUID();
          urlMap.set(url, trackingId);
        }
      } else {
        console.log(`[Workflow] Skipping malformed URL that contains template/HTML syntax: ${url.substring(0, 100)}`);
      }
    }

    console.log(`[Workflow] Found ${urlMap.size} unique URLs to track`);

    // Step 3: Create tracking link records in DB
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

    // Step 4: Replace URLs in the masked content
    // Sort by length descending to avoid partial replacements
    const sortedUrls = Array.from(urlMap.keys()).sort((a, b) => b.length - a.length);
    let maskedResult = maskedContent;

    // 4a. Replace href attributes - we need to work with the original tags
    for (let i = 0; i < tags.length; i++) {
      const originalTag = tags[i];
      let modifiedTag = originalTag;

      for (const url of sortedUrls) {
        const trackingId = urlMap.get(url)!;
        const trackingUrl = normalizeUrl(appUrl, `/api/track/click/${trackingId}`);

        // Replace href in this tag
        modifiedTag = modifiedTag.replace(
          new RegExp(`href\\s*=\\s*["']${escapeRegex(url)}["']`, 'gi'),
          `href="${trackingUrl}"`
        );
      }

      tags[i] = modifiedTag; // Update the tag with replacements
    }

    // 4b. Replace plain text URLs with clickable tracking links
    for (const url of sortedUrls) {
      const trackingId = urlMap.get(url)!;
      const trackingUrl = normalizeUrl(appUrl, `/api/track/click/${trackingId}`);
      const regex = new RegExp(escapeRegex(url), 'gi');
      const matches = maskedResult.match(regex) || [];

      if (matches.length > 0) {
        maskedResult = maskedResult.replace(regex, `<a href="${trackingUrl}">${url}</a>`);
      }
    }

    // Step 5: Unmask all tags in one go
    personalizedContent = maskedResult.replace(/__TAG_(\d+)__/g, (match: string, idx: string) => {
      const tagIndex = parseInt(idx);
      return tagIndex < tags.length ? tags[tagIndex] : match;
    });

    // Safety cleanup: remove any remaining __TAG_* placeholders that somehow survived
    const afterUnmask = personalizedContent;
    const cleanedContent = afterUnmask.replace(/__TAG_\d+__/g, '');
    const removedCount = (afterUnmask.match(/__TAG_\d+__/g) || []).length;
    if (removedCount > 0) {
      console.error(`[Workflow] WARNING: Removed ${removedCount} stray __TAG_* placeholders that survived unmasking`);
      personalizedContent = cleanedContent;
    }

    console.log(`[Workflow] Replaced URLs with tracking links`);
    console.log(`[Workflow] Final HTML length: ${personalizedContent.length} chars`);

    // Additional diagnostics: check for any URLs that still contain __TAG_
    const badUrls = (personalizedContent.match(/https?:\/\/[^\s<>"']*__TAG_\d+__[^\s<>"']*/gi) || []);
    if (badUrls.length > 0) {
      console.error(`[Workflow] ERROR: Found ${badUrls.length} URLs still containing __TAG_ placeholders!`);
      badUrls.slice(0, 3).forEach((url: string, i: number) => {
        console.error(`[Workflow]   Bad URL ${i + 1}: ${url.substring(0, 150)}`);
      });
    }

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
