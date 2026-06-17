ALTER TABLE "calendar_events"
ADD COLUMN IF NOT EXISTS "meeting_link" text;

ALTER TABLE "calendar_events"
ADD COLUMN IF NOT EXISTS "attendees_summary" text;
