import { createHash } from 'node:crypto';

/**
 * Short, non-reversible identifier for correlating the log lines of one presentation flow.
 * The session_id doubles as the session cookie and the request-object id, so it must not be logged as-is.
 */
export function flowId(sessionId: string): string {
	return createHash('sha256').update(sessionId).digest('hex').slice(0, 12);
}
