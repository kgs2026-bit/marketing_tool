import { sleep, createHook, getWritable } from "workflow";
import { FatalError, RetryableError } from "workflow";
import { createSupabaseServerClient } from "@/lib/supabase/server-only";
import { Resend } from "resend";

// Helper function to generate UUID in a step
async function generateUUID(): Promise<string> {
  "use step";
  // @ts-ignore - crypto is available in steps
  return crypto.randomUUID();
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

  const supabase = createSupabaseServerClient();
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
    const urlMap = new Map<string, string>(); // original URL -> tracking ID

    // Extract all HTTP URLs from href attributes
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

    // Replace all URLs with tracking links
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
        `href='${url}'`,
        `href="${appUrl}/api/track/click/${trackingId}"`
      );
    }

    // Insert tracking links
    if (trackingLinksToCreate.length > 0) {
      await supabase.from("tracking_links").insert(trackingLinksToCreate);
      console.log(`[Workflow] Created ${trackingLinksToCreate.length} tracking links`);
    }

    const subject = (campaign.templates?.subject || campaign.subject || "").replace(/\{\{first_name\}\}/g, contact?.first_name || "");

    // Send email via Resend
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
    await supabase
      .from("campaign_recipients")
      .update({
        status: "delivered",
        sent_at: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
        message_id: data.id,
      })
      .eq("id", recipient.id);

    return { success: true, recipientId: recipient.id, messageId: data.id };
  } catch (err: any) {
    console.error(`[Workflow] Failed to send to ${recipient.email}:`, err);

    // Determine if error is retryable
    if (err.message?.includes("rate") || err.message?.includes("429")) {
      throw new RetryableError(`Rate limited: ${err.message}`, { retryAfter: "5m" });
    }

    // Update recipient as bounced
    await supabase
      .from("campaign_recipients")
      .update({
        status: "bounced",
        bounced_at: new Date().toISOString(),
        bounce_reason: err.message,
      })
      .eq("id", recipient.id);

    return { success: false, email: recipient.email, error: err.message };
  }
}

// Main workflow
export async function sendCampaignWorkflow(campaignId: string) {
  "use workflow";

  console.log(`[Workflow] Starting sendCampaignWorkflow for campaignId: ${campaignId}`);

  const supabase = createSupabaseServerClient();

  console.log(`[Workflow] Attempting to fetch campaign ${campaignId} from Supabase`);
  console.log(`[Workflow] Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);

  // Fetch campaign with recipients
  const { data: campaign, error: campaignError } = await supabase
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

  if (campaignError || !campaign) {
    console.error(`[Workflow] Campaign fetch error:`, campaignError);
    console.error(`[Workflow] Error details:`, {
      message: campaignError?.message,
      code: campaignError?.code,
      details: campaignError?.details,
    });
    console.error(`[Workflow] Campaign not found: ${campaignId}. This could mean:`);
    console.error(`  - The campaign ID is incorrect`);
    console.error(`  - The campaign was deleted`);
    console.error(`  - Workflow is connecting to a different Supabase project (check env vars)`);
    console.error(`  - Service role key is missing or invalid`);
    console.error(`[Debug] Checking env vars:`);
    console.error(`  NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING'}`);
    console.error(`  SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING'}`);
    throw new FatalError(`Campaign not found: ${campaignId}`);
  }

  console.log(`[Workflow] Found campaign: ${campaign.name} with ${campaign.campaign_recipients?.length || 0} recipients`);

  // Filter out unsubscribed contacts
  const recipientsToSend = (campaign.campaign_recipients || []).filter((recipient: any) => {
    const contact = recipient.contacts;
    return contact?.status !== "unsubscribed";
  });

  if (recipientsToSend.length === 0) {
    await supabase
      .from("campaigns")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", campaignId);
    return { success: true, sent: 0, failed: 0, total: 0 };
  }

  // Get user email and sender name
  const { data: authUser } = await supabase
    .from("auth.users")
    .select("email, user_metadata")
    .eq("id", campaign.user_id)
    .single();

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

      // If too many consecutive failures, stop
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

      // Random delay between emails (3-5 minutes) to avoid spam detection
      // Skip delay for last email
      if (i < recipientsToSend.length - 1) {
        const delaySeconds = 180 + Math.random() * 120; // 180-300 seconds
        await sleep(`${Math.floor(delaySeconds)}s`);
      }
    } catch (err: any) {
      console.error(`Error processing recipient ${recipient.email}:`, err);
      // Continue to next recipient on non-fatal errors
      if (err instanceof FatalError) {
        throw err; // Stop the workflow
      }
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  // Mark campaign as sent (or partially sent)
  await supabase
    .from("campaigns")
    .update({
      status: failureCount > 0 ? "sent" : "sent",
      sent_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  return {
    success: true,
    sent: successCount,
    failed: failureCount,
    total: recipientsToSend.length,
    results,
  };
}
