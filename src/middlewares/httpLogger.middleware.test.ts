import { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';

const lines: any[] = [];

vi.mock('../logger', async () => {
	const { pino } = await import('pino');
	const sink = new Writable({
		write(chunk, _enc, cb) {
			lines.push(JSON.parse(chunk.toString()));
			cb();
		},
	});
	return { logger: pino(sink) };
});

const { HttpLoggerMiddleware } = await import('./httpLogger.middleware');

describe('HttpLoggerMiddleware', () => {
	it('drops the query of the redirect to the wallet but keeps its origin and path', async () => {
		const sessionId = 'secret-session-id';
		const walletUrl =
			'https://wallet.example.org/cb?client_id=x509_san_dns%3Averifier.example.org' +
			'&request_uri=' +
			encodeURIComponent(
				`https://verifier.example.org/verification/request-object?id=${sessionId}`,
			);

		const app = express();
		app.use(HttpLoggerMiddleware);
		app.post('/redirect', (_req, res) => res.redirect(walletUrl));

		const server = app.listen(0);
		try {
			const { port } = server.address() as AddressInfo;
			const response = await fetch(`http://127.0.0.1:${port}/redirect`, {
				method: 'POST',
				redirect: 'manual',
			});
			expect(response.headers.get('location')).toBe(walletUrl);
			await vi.waitFor(() => expect(lines).toHaveLength(1));
		} finally {
			server.close();
		}

		expect(lines[0].res.statusCode).toBe(302);
		expect(lines[0].res.headers.location).toBe('https://wallet.example.org/cb');
		expect(JSON.stringify(lines[0])).not.toContain(sessionId);
	});
});
