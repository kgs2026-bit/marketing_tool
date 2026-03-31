# Project History & Implementation Summary

## Last Updated: 2026-03-31

### Completed Features

#### 1. Template Editor Text Visibility Fix
- **Issue:** Text in template editor was transparent/unclear
- **Fix:** Added explicit `text-gray-900` to modal container and `style={{ color: '#000000' }}` to textareas
- **Files:** `src/components/template-editor.tsx`
- **Commit:** 4534ede

#### 2. Forgot Password Feature
- **Status:** Already implemented
- **Enhancement:** Added "Forgot your password?" link on registration page
- **Files:** `src/app/auth/register/page.tsx`
- **Commit:** 4534ede

#### 3. Campaign Name Field
- **Issue:** Campaign builder had `name` in state but no input field
- **Fix:** Added required "Campaign Name" text input in Step 1
- **Files:** `src/components/campaign-builder.tsx`
- **Commit:** 288c082

#### 4. Dynamic "From Name" for Campaigns
- **Feature:** Users can now customize sender name per campaign
- **Database:** Added `sender_name` column to `campaigns` table
- **Settings:** Added "Default Sender Name" field in Settings page for Resend provider
- **API:** Updated send endpoint to use campaign's `sender_name` or fall back to user's name
- **Files:** 
  - `migrations/003_add_sender_name_to_campaigns.sql`
  - `src/components/campaign-builder.tsx`
  - `src/app/api/campaigns/[id]/send/route.ts`
  - `src/app/dashboard/settings/page.tsx`
  - `src/app/dashboard/campaigns/page.tsx`
- **Commit:** 288c082

#### 5. Open Tracking
- **Feature:** Track when emails are opened
- **Implementation:** Added 1x1 tracking pixel inserted before `</body>`, `</html>`, or appended
- **Endpoint:** `GET /api/track/open/[recipientId]` updates `campaign_recipients` status to 'opened'
- **Files:** 
  - `src/app/api/campaigns/[id]/send/route.ts`
  - `src/app/api/track/open/[recipientId]/route.ts` (existing)
- **Commit:** 12636af

#### 6. Scheduled Campaigns
- **Feature:** Automatically send campaigns at scheduled date/time
- **Implementation:**
  - Created `GET /api/campaigns/scheduled?secret=...` endpoint
  - Finds campaigns with `status='scheduled'` and `scheduled_at <= now`
  - Marks as 'sending' to prevent duplicates
  - Calls send endpoint for each campaign
  - Reverts to 'scheduled' on failure
- **Timezone:** Converted `datetime-local` input to UTC before saving
- **Logging:** Added comprehensive `[Scheduled]` console logs for debugging
- **Files:** 
  - `src/app/api/campaigns/scheduled/route.ts`
  - `src/components/campaign-builder.tsx`
  - `src/app/api/campaigns/[id]/send/route.ts`
- **Cron Setup Required:**
  - Environment: `CRON_SECRET` (added to Vercel: `b3f7c9a1e4d8g2h5j6k9m0p3q7r4s8t1u2v5w6x8y0z`)
  - Vercel Cron: `vercel.json` with `* * * * *` schedule
- **Commit:** 12636af → 5d0ca60

#### 7. Email Sending Delays
- **Feature:** Add random 3-5 minute gap between each email in a campaign
- **Implementation:** `sleep()` delay in send endpoint between recipients
- **Purpose:** Prevent spam triggers and rate limiting
- **Files:** `src/app/api/campaigns/[id]/send/route.ts`
- **Commit:** 12636af

#### 8. Click Tracking
- **Feature:** Track link clicks in emails
- **Implementation:**
  - Rewrites all `http/https` links to tracking URLs
  - Creates `tracking_links` records with `tracking_id`
  - Click endpoint increments count and updates recipient status to 'clicked'
- **Endpoint:** `GET /api/track/click/[trackingId]`
- **Files:**
  - `src/app/api/track/click/[trackingId]/route.ts`
  - `src/app/api/campaigns/[id]/send/route.ts`
- **Commit:** 5d0ca60

#### 9. Detailed Analytics with Contact Data
- **Feature:** Show per-recipient detailed status for each campaign
- **Implementation:**
  - Fetches all `campaign_recipients` with joined `contact` data
  - Displays table with: Name, Email, Status, Sent/Opened/Clicked/Bounced timestamps
  - Fixed foreign key relationship: `contact` (singular) not `contacts`
- **Files:** `src/app/dashboard/analytics/page.tsx`
- **Commit:** 7e1680b

### Environment Variables Required

**.env.local / Vercel:**

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
RESEND_API_KEY=your_resend_api_key (optional if only using Gmail)
RESEND_FROM_EMAIL=onboarding@yourdomain.com (for Resend)
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
CRON_SECRET=b3f7c9a1e4d8g2h5j6k9m0p3q7r4s8t1u2v5w6x8y0z
```

### Database Migrations

Run these migrations in Supabase SQL Editor:

1. `migrations/002_add_email_provider_and_configs.sql` (if not already run)
2. `migrations/003_add_sender_name_to_campaigns.sql`

### Important Notes

- **Campaign Builder Modal:** Added `text-gray-900` to fix text visibility in dark mode
- **Timezone Handling:** Scheduled datetime-local converted to UTC before storing
- **Email Provider:** Users can choose Resend (recommended) or Gmail SMTP (max 500/day)
- **Analytics:** Status transitions: `draft` → `scheduled` → `sending` → `sent` (or back to `scheduled` on error)
- **Recipient Statuses:** `pending` → `delivered` → `opened`/`clicked` (or `bounced` on failure)

### Git Commits

- 4534ede: Fix template editor text + forgot password link
- 288c082: Add campaign name field + dynamic from name + sender_name migration
- 85aef3c: Fix campaign builder text visibility (modal + inputs)
- 12636af: Fix open tracking + scheduled campaigns + email delays
- 81d1d14: Fix TypeScript errors in send endpoint
- 5d0ca60: Fix build errors + complete tracking/analytics
- 7e1680b: Fix analytics - show contact names (FK relationship fix)
- 8e75dbe: Add vercel.json + .env.example

### Current Build Status

✅ Build successful
⚠️ Deprecation warning: "middleware file convention is deprecated" - harmless, can ignore
