ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tempo App User Access" ON emails;
CREATE POLICY "Tempo App User Access" ON emails FOR ALL USING (user_id = current_setting('app.current_user_id', true));

ALTER TABLE hitl_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tempo App User Access" ON hitl_actions;
CREATE POLICY "Tempo App User Access" ON hitl_actions FOR ALL USING (user_id = current_setting('app.current_user_id', true));

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tempo App User Access" ON audit_logs;
CREATE POLICY "Tempo App User Access" ON audit_logs FOR ALL USING (user_id = current_setting('app.current_user_id', true));

ALTER TABLE auto_reply_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tempo App User Access" ON auto_reply_drafts;
CREATE POLICY "Tempo App User Access" ON auto_reply_drafts FOR ALL USING (user_id = current_setting('app.current_user_id', true));

ALTER TABLE contact_intelligence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tempo App User Access" ON contact_intelligence;
CREATE POLICY "Tempo App User Access" ON contact_intelligence FOR ALL USING (user_id = current_setting('app.current_user_id', true));

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tempo App User Access" ON calendar_events;
CREATE POLICY "Tempo App User Access" ON calendar_events FOR ALL USING (user_id = current_setting('app.current_user_id', true));
