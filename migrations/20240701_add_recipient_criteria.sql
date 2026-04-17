-- Add recipient_criteria column to campaigns table
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS recipient_criteria JSONB DEFAULT '{}';

-- Update existing campaigns to have recipient criteria based on their recipient_list
-- This migration runs for campaigns that have recipient_list but no recipient_criteria
DO $$
DECLARE
  campaign RECORD;
BEGIN
  FOR campaign IN
    SELECT id, recipient_list
    FROM campaigns
    WHERE recipient_criteria = '{}'
    AND recipient_list IS NOT NULL
    AND array_length(recipient_list::text[], 1) > 0
  LOOP
    -- Create recipient criteria for existing campaigns
    UPDATE campaigns
    SET recipient_criteria = jsonb_build_object(
      'contact_ids', campaign.recipient_list,
      'filter_mode', 'manual',
      'created_at', NOW()
    )
    WHERE id = campaign.id;

    RAISE NOTICE 'Updated campaign % with recipient criteria', campaign.id;
  END LOOP;
END $$;

-- Add a function to refresh campaign recipients
CREATE OR REPLACE FUNCTION refresh_campaign_recipients(campaign_id UUID)
RETURNS TABLE (
  contact_id UUID,
  email VARCHAR(255),
  status VARCHAR(50)
) AS $$
DECLARE
  campaign_record campaigns%ROWTYPE;
  contact RECORD;
BEGIN
  -- Get campaign details
  SELECT * INTO campaign_record FROM campaigns WHERE id = campaign_id;

  -- Clear existing recipients
  DELETE FROM campaign_recipients WHERE campaign_id = campaign_id;

  -- Insert new recipients based on criteria
  IF campaign_record.recipient_criteria IS NOT NULL AND jsonb_typeof(campaign_record.recipient_criteria) = 'object' THEN
    -- Dynamic criteria-based selection
    IF campaign_record.recipient_criteria ? 'tags' AND campaign_record.recipient_criteria->'tags' IS NOT NULL THEN
      -- Tag-based selection
      INSERT INTO campaign_recipients (campaign_id, contact_id, email, status)
      SELECT
        campaign_id,
        id,
        email,
        'pending'
      FROM contacts
      WHERE user_id = campaign_record.user_id
        AND status = 'active'
        AND tags && campaign_record.recipient_criteria->'tags';
    END IF;

    -- Also include manually selected contacts if specified
    IF campaign_record.recipient_criteria ? 'contact_ids' AND campaign_record.recipient_criteria->'contact_ids' IS NOT NULL THEN
      INSERT INTO campaign_recipients (campaign_id, contact_id, email, status)
      SELECT
        campaign_id,
        contact_id,
        email,
        'pending'
      FROM (
        SELECT UNNEST(campaign_record.recipient_criteria->'contact_ids'::UUID[]) AS contact_id
      ) AS contact_ids
      LEFT JOIN contacts ON contacts.id = contact_ids.contact_id
      WHERE contacts.user_id = campaign_record.user_id
        AND contacts.status = 'active';
    END IF;
  ELSE
    -- Static ID-based selection (existing logic)
    INSERT INTO campaign_recipients (campaign_id, contact_id, email, status)
    SELECT campaign_id, contact_id, email, 'pending'
    FROM (
      SELECT UNNEST(campaign_record.recipient_list::UUID[]) AS contact_id
    ) AS contact_ids
    LEFT JOIN contacts ON contacts.id = contact_ids.contact_id
    WHERE contacts.user_id = campaign_record.user_id
      AND contacts.status = 'active';
  END IF;

  RETURN QUERY SELECT id, email, status FROM campaign_recipients WHERE campaign_id = campaign_id;
END;
$$ LANGUAGE plpgsql;