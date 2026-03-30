# Email Marketing Tool

A full-stack email marketing application built with Next.js 14, Supabase, and Resend.

## Features

- **Authentication**: Sign up / Sign in with Supabase Auth
- **Contact Management**: CRUD operations, CSV import/export (planned)
- **Email Templates**: Rich text editor with variable personalization
- **Campaigns**: Create, schedule, and send email campaigns
- **Analytics**: Track opens, clicks, bounces, and delivery rates
- **Automatic Tracking**: Open tracking pixel and click tracking via Resend webhooks

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase PostgreSQL
- **Email**: Resend API
- **Auth**: Supabase Auth

## Setup

### 1. Clone and Install

\`\`\`bash
cd email-marketing-tool
npm install
\`\`\`

### 2. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In your project, go to **SQL Editor** and run the SQL in \`supabase-schema.sql\`
3. Go to **Settings > API** and copy your:
   - Project URL
   - \`anon\` public key
   - \`service_role\` secret key
4. Enable Email auth provider under **Authentication > Providers**

### 3. Create a Resend Account

1. Sign up at [resend.com](https://resend.com)
2. Get your API key from **API Keys**
3. Add and verify a sending domain (or use the onboarding domain for testing)

### 4. Configure Environment Variables

Copy \`.env.local.example\` to \`.env.local\` and fill in your values:

\`\`\`env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=your_verified_sender@yourdomain.com
NEXT_PUBLIC_APP_URL=http://localhost:3000
\`\`\`

> **IMPORTANT**: \`SUPABASE_SERVICE_ROLE_KEY\` is a secret key and should never be exposed to the client. It's only used in server actions.

### 5. Run the Development Server

\`\`\`bash
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) and create an account.

## Project Structure

\`\`\`
src/
├── app/
│   ├── (auth)/          # Authentication pages (login, register)
│   ├── (dashboard)/     # Protected dashboard pages
│   │   ├── contacts/    # Contact management
│   │   ├── templates/   # Email templates
│   │   ├── campaigns/   # Campaign management
│   │   ├── analytics/   # Campaign analytics
│   │   └── page.tsx     # Dashboard home
│   ├── api/             # API routes
│   │   ├── contacts/    # Contact CRUD
│   │   ├── templates/   # Template CRUD
│   │   ├── campaigns/   # Campaign CRUD + send
│   │   ├── webhooks/    # Resend webhook handler
│   │   ├── track/       # Open tracking pixel
│   │   └── unsubscribe/ # Unsubscribe handler
│   └── layout.tsx
├── components/           # Reusable UI components
└── lib/
    └── supabase/        # Supabase clients
\`\`\`

## Usage

1. **Create Contacts**: Go to Contacts page, add contacts manually or import CSV (coming soon)
2. **Create Templates**: Go to Templates, design your email with variables like \`{{first_name}}\`
3. **Create Campaign**: Go to Campaigns, select a template, choose recipients, and send or schedule
4. **View Analytics**: Check the Analytics page for opens, clicks, and bounces

## Supported Variables

In templates and campaign subjects, you can use:

- \`{{first_name}}\`
- \`{{last_name}}\`
- \`{{email}}\`
- \`{{company}}\`
- \`{{unsubscribe_link}}\` (automatically added in send)

## Webhooks

The app includes a webhook endpoint at \`/api/webhooks/resend\` to receive Resend events and update campaign tracking automatically.

Make sure to configure webhook in Resend dashboard to point to your deployed URL: \`https://yourdomain.com/api/webhooks/resend\`

## Notes

- For development, you can use Resend's onboarding domain for testing
- Database uses Row Level Security (RLS) to ensure users only see their own data
- Tracking pixel and unsubscribe links require your app to be publicly accessible (doesn't work well on localhost)

## Deploy

Deploy to Vercel or any Node.js hosting:

\`\`\`bash
npm run build
npm start
\`\`\`

Make sure to set all environment variables in your hosting platform.
