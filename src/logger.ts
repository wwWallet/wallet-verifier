import { pino } from 'pino';

const CENSOR = '[redacted]';

const redactPaths = [
	'session_id',
	'*.session_id',
	'response_code',
	'*.response_code',
	'vp_token',
	'*.vp_token',
	'rp_eph_priv',
	'*.rp_eph_priv',
	'cookies',
	'*.cookies',
];

export const logger = pino({
	level: process.env.LOG_LEVEL || 'info',

	redact: {
		paths: redactPaths,
		censor: CENSOR,
	},

	transport:
		process.env.NODE_ENV !== 'production'
			? {
					target: 'pino-pretty',
					options: {
						colorize: true,
						messageFormat: '{if module}[{module}] {end}{msg}',
						ignore: 'pid,hostname,module',
					},
				}
			: undefined,
});
