-- Migration: Add email provider support

-- Add email_provider column to campaigns table
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS email_provider VARCHAR(50) DEFAULT 'resend' 
CHECK (email_provider IN ('resend', 'gmail'));

-- Create user_email_configs table for storing SMTP credentials
CREATE TABLE IF NOT EXISTS user_email_configs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('resend', 'gmail')),
  smtp_host VARCHAR(255) DEFAULT 'smtp.gmail.com',
  smtp_port INTEGER DEFAULT 465,
  smtp_username TEXT,
  smtp_password TEXT,
  smtp_secure BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

ALTER TABLE user_email_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own email configs" ON user_email_configs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own email configs" ON user_email_configs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own email configs" ON user_email_configs
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own email configs" ON user_email_configs
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_email_configs_user_id ON user_email_configs(user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_email_configs_updated_at BEFORE UPDATE ON user_email_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update existing campaigns to have email_provider = 'resend' as default
UPDATE campaigns SET email_provider = 'resend' WHERE email_provider IS NULL;
