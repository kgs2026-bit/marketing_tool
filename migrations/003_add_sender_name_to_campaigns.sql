-- Migration: Add sender_name to campaigns for dynamic "From" name

-- Add sender_name column to campaigns table
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS sender_name VARCHAR(255);

-- Optional: Add default_sender_name to user_email_configs for provider-specific defaults
ALTER TABLE user_email_configs
ADD COLUMN IF NOT EXISTS default_sender_name VARCHAR(255);
