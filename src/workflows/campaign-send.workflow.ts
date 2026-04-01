import { getWritable, fetch as workflowFetch } from "workflow";
import { FatalError, RetryableError } from "workflow";
import { Resend } from "resend";

// Step: make a PostgREST call
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

// Step: fetch auth user via Auth Admin API
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
    const errorText = await response.text();
    throw new Error(`Auth API error ${response.status}: ${errorText}`);
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

// Step: delay between emails (ensures checkpointing)
async function delayStep(seconds: number) {
  "use step";
  console.log(`[Workflow] Sleeping for ${seconds} seconds...`);
  // Use workflow's sleep within a step to create a durable timer
  await (workflowFetch as any)(`internal://sleep/${seconds}s`, { method: 'POST' });
}

// Step: send single email
async function sendSingleEmailStep(
  campaignId: string,
  recipient: any,
  appUrl: string,
  campaign: any,
  senderName: string,
  userEmail: string
) {
  "use step";

  console.log(`[Workflow] Sending to ${recipient.email}`);

  // Fetch contact
  const contactData = await postgrest(
    `/rest/v1/contacts?id=eq.${recipient.contact_id}&select=*`,
    'GET'
  );
  const contact = contactData[0];

  // Personalize content
  let htmlContent = campaign.templates?.html_content || campaign.html_content || "";
  const trackingPixel = `<img src="${appUrl}/api/track/open/${recipient.id}" width="1" height="1" alt="" style="display:none;" />`;

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
  personalizedContent = personalizedContent.replace(/\{\{unsubscribe_link\}\}/g, `${appUrl}/api/unsubscribe/${recipient.id}`);

  // Click tracking - build array of URLs to replace
  const urls: string[] = [];
  const urlMap = new Map<string, string>();
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = hrefRegex.exec(htmlContent)) !== null) {
    const url = match[1];
    if (url.startsWith("http") && !urlMap.has(url)) {
      const trackingId = crypto.randomUUID();
      urlMap.set(url, trackingId);
      urls.push(url);
    }
  }

  // Create tracking links
  const trackingLinksToCreate: any[] = urls.map(url => ({
    tracking_id: urlMap.get(url)!,
    campaign_recipient_id: recipient.id,
    original_url: url,
    click_count: 0,
    created_at: new Date().toISOString(),
  }));

  if (trackingLinksToCreate.length > 0) {
    try {
      await postgrest('/rest/v1/tracking_links', 'POST', trackingLinksToCreate);
      console.log(`[Workflow] Created ${trackingLinksToCreate.length} tracking links`);
    } catch (err: any) {
      console.error(`[Workflow] Failed to create tracking links:`, err.message);
      // Continue anyway - tracking links are optional
    }
  }

  // Replace URLs with tracking links
  for (const url of urls) {
    const trackingId = urlMap.get(url)!;
    const trackingUrl = `${appUrl}/api/track/click/${trackingId}`;
    personalizedContent = personalizedContent.replaceAll(`href="${url}"`, `href="${trackingUrl}"`);
    personalizedContent = personalizedContent.replaceAll(`href='${url}'`, `href="${trackingUrl}"`);
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
}

// Main workflow
export async function sendCampaignWorkflow(campaignId: string) {
  "use workflow";

  console.log('[Workflow] === START ===');
  console.log('[Workflow] NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING');
  console.log('[Workflow] SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING');
  console.log('[Workflow] NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL);
  console.log('[Workflow] ===============');

  // Fetch campaign
  const campaign = await fetchCampaignStep(campaignId);
  console.log(`[Workflow] Campaign: ${campaign.name}, recipients: ${campaign.campaign_recipients?.length || 0}`);

  // Filter recipients
  const recipientsToSend = (campaign.campaign_recipients || []).filter((recipient: any) => {
    const contact = recipient.contacts;
    return contact?.status !== "unsubscribed";
  });

  if (recipientsToSend.length === 0) {
    await updateCampaignStatusStep(campaignId, "sent", new Date().toISOString());
    return { success: true, sent: 0, failed: 0, total: 0 };
  }

  // Get user info
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

  // Process each recipient with explicit delay steps
  for (let i = 0; i < recipientsToSend.length; i++) {
    const recipient = recipientsToSend[i];
    console.log(`[Workflow] Processing recipient ${i + 1}/${recipientsToSend.length}: ${recipient.email}`);

    try {
      // Send email (step)
      const result = await sendSingleEmailStep(campaignId, recipient, appUrl, campaign, senderName, userEmail);
      results.push(result);

      if (result.success) {
        consecutiveFailures = 0;
      } else {
        consecutiveFailures++;
      }

      if (consecutiveFailures >= maxConsecutiveFailures) {
        throw new FatalError(`${maxConsecutiveFailures} consecutive failures, stopping`);
      }

      // Progress update
      const writable = getWritable();
      const writer = writable.getWriter();
      try {
        await writer.write({
          type: "progress",
          current: i + 1,
          total: recipientsToSend.length,
          success: result.success,
          email: recipient.email,
        });
      } finally {
        writer.releaseLock();
      }

      // Delay before next email (using delay step for proper checkpointing)
      if (i < recipientsToSend.length - 1) {
        const delaySeconds = 180 + Math.random() * 120; // 3-5 minutes (180-300 seconds)
        console.log(`[Workflow] About to delay for ${Math.floor(delaySeconds)} seconds...`);
        await delayStep(Math.floor(delaySeconds));
        console.log(`[Workflow] Delay completed, continuing to next recipient`);
      }
    } catch (err: any) {
      console.error(`[Workflow] Error processing recipient ${recipient.email}:`, err);
      if (err instanceof FatalError) {
        throw err;
      }
    }
  }

  // Update final status
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
