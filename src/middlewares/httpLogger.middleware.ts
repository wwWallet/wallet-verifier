import { pinoHttp } from 'pino-http';
import { logger } from '../logger';

// we will ignore static files in the logger
const STATIC_PREFIXES = [
	'/images/',
	'/icons/',
	'/js/',
	'/css/',
	'/styles/',
	'/fonts/',
	'/metadata/',
];

// this gets asked once a second by every open QR page so we ignore it later to prevent spam
const STATUS_POLL_PREFIX = '/verifier/public/definitions/presentation-request/status/';

export const HttpLoggerMiddleware = pinoHttp({
	logger: logger.child({ module: 'HTTP' }),

	autoLogging: {
		ignore: (req) => {
			const path = req.url?.split('?')[0] ?? '';
			return (
				path.startsWith(STATUS_POLL_PREFIX) ||
				STATIC_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
				path === '/favicon.ico'
			);
		},
	},

	customLogLevel: (_req, res, err) => {
		if (err || res.statusCode >= 500) return 'error';
		if (res.statusCode >= 400) return 'warn';
		return 'info';
	},

	serializers: {
		req: (req) => ({
			method: req.method,
			url: req.url?.split('?')[0],
			query: req.query,
			headers: req.headers,
			remoteAddress: req.remoteAddress,
		}),
	},

	redact: {
		paths: [
			'req.headers.authorization',
			'req.headers.cookie',
			'req.query.*',
			'res.headers["set-cookie"]',
		],
		censor: '[redacted]',
	},
});
