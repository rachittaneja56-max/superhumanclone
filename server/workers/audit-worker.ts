import { workerDb } from '../db/worker-index';
import { auditLogs } from '../db/schema';
import { sanitisePayload } from '../../lib/sanitise-payload';
import pino from 'pino';

const logger = pino();

export async function logAuditEvent(
  userId: string,
  action: 'email_sent' | 'email_received' | 'email_archived' | 'hitl_created' | 'hitl_resolved' | 'settings_changed' | 'token_refreshed' | 'admin_promoted' | 'admin_demoted',
  metadata: any
) {
  try {
    const safeDetails = sanitisePayload(metadata);

    await workerDb.insert(auditLogs).values({
      userId,
      action,
      details: safeDetails,
    });
  } catch (error) {
    logger.error({ err: error, userId, action }, 'Failed to log audit event');
  }
}
