import { sleep, createHook, getWritable, fetch as workflowFetch } from "workflow";
import { FatalError, RetryableError } from "workflow";
import { createClient } from '@supabase/supabase-js';
import { Resend } from "resend";

// Helper to create Supabase client that uses workflow's fetch
function createWorkflowSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { fetch: workflowFetch as any }
  );
}

// Helper function to generate UUID in a step
async function generateUUID(): Promise<string> {
  "use step";
  // @ts-ignore - crypto is available in steps
  return crypto.randomUUID();
}

// Step: insert tracking links
async function insertTrackingLinks(links: any[]) {
  "use step";
  if (links.length === 0) return;
  const supabase = createWorkflowSupabaseClient();
  await supabase.from("tracking_links").insert(links);
  console.log(`[Workflow] Created ${links.length} tracking links`);
}

// Step: update recipient status
async function updateRecipientStatus(recipientId: string, status: string, extras: any = {}) {
  "use step";
  const supabase = createWorkflowSupabaseClient();
  await supabase.from("campaign_recipients").update({ status, ...extras }).eq("id", recipientId);
}

// Step function to send a single email
async function sendSingleEmail(
  campaignId: string,
  recipient: any,
  appUrl: string,
  campaign: any,
  senderName: string,
  userEmail: string
) {
  "use step";

  // Set global fetch for Resend (uses global fetch internally)
  // @ts-ignore
  global.fetch = workflowFetch;

  const supabase = createWorkflowSupabaseClient();
  const resend = new Resend(process.env.RESEND_API_KEY!);

  try {
    console.log(`[Workflow] Starting email send to ${recipient.email} (campaign: ${campaignId})`);

    // Fetch contact data
    const { data: contact } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", recipient.contact_id)
      .single();

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

    // Add click tracking - find all URLs first
    const urls: string[] = [];
    const urlMap = new Map<string, string>();

    const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
    let match;
    while ((match = hrefRegex.exec(htmlContent)) !== null) {
      const url = match[1];
      if (url.startsWith("http") && !urlMap.has(url)) {
        const trackingId = await generateUUID();
        urlMap.set(url, trackingId);
        urls.push(url);
      }
    }

    let trackingLinksToCreate: any[] = [];
    for (const url of urls) {
      const trackingId = urlMap.get(url)!;
      trackingLinksToCreate.push({
        tracking_id: trackingId,
        campaign_recipient_id: recipient.id,
        original_url: url,
        click_count: 0,
        created_at: new Date().toISOString(),
      });
      personalizedContent = personalizedContent.replace(
        `href="${url}"`,
        `href="${appUrl}/api/track/click/${trackingId}"`
      );
      personalizedContent = personalizedContent.replace(
        `href='${url}"`,
        `href="${appUrl}/api/track/click/${trackingId}"`
      );
    }

    // Insert tracking links
    await insertTrackingLinks(trackingLinksToCreate);

    const subject = (campaign.templates?.subject || campaign.subject || "").replace(/\{\{first_name\}\}/g, contact?.first_name || "");

    const fromAddress = userEmail ? `${senderName} <${userEmail}>` : `${senderName} <${process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"}>`;

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
    await updateRecipientStatus(recipient.id, "delivered", {
      sent_at: new Date().toISOString(),
      delivered_at: new Date().toISOString(),
      message_id: data.id,
    });

    return { success: true, recipientId: recipient.id, messageId: data.id };
  } catch (err: any) {
    console.error(`[Workflow] Failed to send to ${recipient.email}:`, err);

    if (err.message?.includes("rate") || err.message?.includes("429")) {
      throw new RetryableError(`Rate limited: ${err.message}`, { retryAfter: "5m" });
    }

    // Update recipient as bounced
    await updateRecipientStatus(recipient.id, "bounced", {
      bounced_at: new Date().toISOString(),
      bounce_reason: err.message,
    });

    return { success: false, email: recipient.email, error: err.message };
  }
}

// Step: fetch campaign with recipients
async function fetchCampaign(campaignId: string) {
  "use step";
  const supabase = createWorkflowSupabaseClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select(`
      *,
      templates (id, name, subject, html_content),
      campaign_recipients (
        id,
        email,
        contact_id,
        contacts (id, email, first_name, last_name, company)
      )
    `)
    .eq("id", campaignId)
    .single();

  if (error || !data) {
    throw new FatalError(`Campaign not found: ${campaignId}`);
  }
  return data;
}

// Step: fetch auth user
async function fetchAuthUser(userId: string) {
  "use step";
  const supabase = createWorkflowSupabaseClient();
  const { data } = await supabase
    .from("auth.users")
    .select("email, user_metadata")
    .eq("id", userId)
    .single();
  return data;
}

// Step: update campaign status
async function updateCampaignStatus(campaignId: string, status: string, sentAt?: string) {
  "use step";
  const supabase = createWorkflowSupabaseClient();
  const update: any = { status };
  if (sentAt) update.sent_at = sentAt;
  await supabase.from("campaigns").update(update).eq("id", campaignId);
}

// Main workflow
export async function sendCampaignWorkflow(campaignId: string) {
  "use workflow";

  console.log('[Workflow] === ENVIRONMENT DIAGNOSTICS ===');
  console.log('[Workflow] NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING');
  console.log('[Workflow] SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING');
  console.log('[Workflow] NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL);
  console.log('[Workflow] ==================================');

  console.log(`[Workflow] Starting sendCampaignWorkflow for campaignId: ${campaignId}`);

  // Fetch campaign (step)
  const campaign = await fetchCampaign(campaignId);
  console.log(`[Workflow] Found campaign: ${campaign.name} with ${campaign.campaign_recipients?.length || 0} recipients`);

  // Filter out unsubscribed contacts
  const recipientsToSend = (campaign.campaign_recipients || []).filter((recipient: any) => {
    const contact = recipient.contacts;
    return contact?.status !== "unsubscribed";
  });

  if (recipientsToSend.length === 0) {
    await updateCampaignStatus(campaignId, "sent", new Date().toISOString());
    return { success: true, sent: 0, failed: 0, total: 0 };
  }

  // Get user email and sender name (step)
  const authUser = await fetchAuthUser(campaign.user_id);
  const userEmail = authUser?.email || "";
  const senderName =
    campaign.sender_name ||
    authUser?.user_metadata?.full_name ||
    authUser?.user_metadata?.name ||
    userEmail?.split("@")[0] ||
    "User";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const results: any[] = [];
  let consecutiveFailures = 0;
  const maxConsecutiveFailures = 10;

  // Send emails one by one with delays
  for (let i = 0; i < recipientsToSend.length; i++) {
    const recipient = recipientsToSend[i];

    try {
      const result = await sendSingleEmail(campaignId, recipient, appUrl, campaign, senderName, userEmail);
      results.push(result);

      if (result.success) {
        consecutiveFailures = 0;
      } else {
        consecutiveFailures++;
      }

      if (consecutiveFailures >= maxConsecutiveFailures) {
        throw new FatalError(`Too many consecutive failures (${maxConsecutiveFailures}), stopping campaign`);
      }

      // Log progress to workflow stream
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

      if (i < recipientsToSend.length - 1) {
        const delaySeconds = 180 + Math.random() * 120;
        await sleep(`${Math.floor(delaySeconds)}s`);
      }
    } catch (err: any) {
      console.error(`Error processing recipient ${recipient.email}:`, err);
      if (err instanceof FatalError) {
        throw err;
      }
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  // Mark campaign as sent
  await updateCampaignStatus(campaignId, "sent", new Date().toISOString());

  return {
    success: true,
    sent: successCount,
    failed: failureCount,
    total: recipientsToSend.length,
    results,
  };
}
