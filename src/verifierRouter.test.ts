import { AddressInfo } from 'node:net';
import path from 'node:path';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';

// Keys are not available in CI, and OpenidForPresentationReceivingService reads them at
// import time. Only fake those reads: pug needs the real fs to load the views.
vi.mock('fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('fs')>();
	const readFileSync = vi.fn((file: any, ...args: any[]) =>
		/pem\.(key|crt)$/.test(String(file))
			? '-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE-----\n'
			: (actual.readFileSync as any)(file, ...args),
	);
	return { ...actual, default: { ...actual, readFileSync }, readFileSync };
});

vi.mock('../config', () => ({
	config: {
		url: 'http://localhost:8005',
		trustedRootCertificates: [],
		trustedIssuers: [],
		presentationFlow: { response_mode: 'direct_post' },
		siteConfig: {},
	},
}));

vi.mock('./AppDataSource', () => ({
	default: { isInitialized: false },
}));

vi.mock('./logger', async () => {
	const { pino } = await import('pino');
	return { logger: pino({ level: 'silent' }) };
});

const { default: locale } = await import('../config/locale');
const { verifierRouter } = await import('./verifierRouter');

// Express 4 does not catch rejected promises from async route handlers: the request is
// never answered and the rejection is unhandled, which makes app.ts exit the process.
// Under vitest a crash shows up as a request timeout plus an "Unhandled Rejection" error.
async function withVerifierApp(fn: (baseUrl: string) => Promise<void>): Promise<void> {
	const app = express();
	app.use(express.urlencoded({ extended: true }));
	app.set('view engine', 'pug');
	app.set('views', path.join(__dirname, '../views'));
	app.use((_req, res, next) => {
		res.locals.lang = 'en';
		res.locals.locale = locale['en'];
		next();
	});
	app.use('/verifier', verifierRouter);

	const server = app.listen(0);
	try {
		const { port } = server.address() as AddressInfo;
		await fn(`http://127.0.0.1:${port}`);
	} finally {
		server.close();
	}
}

describe('verifierRouter on invalid input', () => {
	it('renders "not found" for an unknown presentation request id instead of crashing', async () => {
		await withVerifierApp(async (baseUrl) => {
			const response = await fetch(
				`${baseUrl}/verifier/public/definitions/presentation-request/does-not-exist`,
				{ signal: AbortSignal.timeout(2000) },
			);

			expect(response.status).toBeLessThan(500);
			expect(await response.text()).toContain('No presentation request was found');
		});
	});

	it('answers a dcql_query that is not JSON with an error page instead of crashing', async () => {
		await withVerifierApp(async (baseUrl) => {
			const response = await fetch(
				`${baseUrl}/verifier/public/definitions/presentation-request/custom`,
				{
					method: 'POST',
					body: new URLSearchParams({ dcql_query: '{not json' }),
					signal: AbortSignal.timeout(2000),
				},
			);

			expect(response.status).toBeLessThan(500);
		});
	});
});
