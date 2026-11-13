import { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

// Keys and config are not available in CI, and the module reads them at import time
vi.mock('fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('fs')>();
	const readFileSync = vi.fn(
		() => '-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE-----\n',
	);
	return { ...actual, default: { ...actual, readFileSync }, readFileSync };
});

vi.mock('../../config', () => ({
	config: {
		trustedRootCertificates: [],
		trustedIssuers: [],
		presentationFlow: { response_mode: 'direct_post' },
	},
}));

vi.mock('../AppDataSource', () => ({
	default: { isInitialized: false },
}));

vi.mock('../logger', async () => {
	const { pino } = await import('pino');
	return { logger: pino({ level: 'silent' }) };
});

const { OpenidForPresentationsReceivingService } =
	await import('./OpenidForPresentationReceivingService');

function createService() {
	return new OpenidForPresentationsReceivingService({
		getConfiguration: () => ({ redirect_uri: 'http://localhost:8005/cb' }) as any,
		getPresentationRequests: () => [],
	});
}

function createContext(body: Record<string, unknown>) {
	const res = {
		status: vi.fn().mockReturnThis(),
		send: vi.fn().mockReturnThis(),
	};
	const req = { body };
	return { req: req as unknown as Request, res: res as unknown as Response & typeof res };
}

describe('OpenidForPresentationsReceivingService.responseHandler', () => {
	it.each([
		['an object', { x: '1' }],
		['an array', ['a', 'b']],
		['a number', 123],
	])('rejects state that is %s with 401', async (_label, state) => {
		const service = createService();
		const handleResponseDirectPost = vi.spyOn(service.openid4vp, 'handleResponseDirectPost');
		const ctx = createContext({ state, vp_token: 'token' });

		await service.responseHandler(ctx);

		expect(ctx.res.status).toHaveBeenCalledWith(401);
		expect(ctx.res.send).toHaveBeenCalledWith({ error: 'Missing state param' });
		expect(handleResponseDirectPost).not.toHaveBeenCalled();
	});

	it('passes a string state through to the direct_post handler', async () => {
		const service = createService();
		const handleResponseDirectPost = vi
			.spyOn(service.openid4vp, 'handleResponseDirectPost')
			.mockResolvedValue({ ok: false, error: 'invalid_request' } as any);
		const ctx = createContext({ state: 'some-state', vp_token: 'token' });

		await service.responseHandler(ctx);

		expect(ctx.res.status).toHaveBeenCalledWith(400);
		expect(ctx.res.send).toHaveBeenCalledWith(
			expect.objectContaining({ error: 'invalid_request' }),
		);

		expect(handleResponseDirectPost).toHaveBeenCalledWith('some-state', 'token', null);
	});
});

describe('OpenidForPresentationsReceivingService.responseHandler on invalid input', () => {
	function expectClientError(res: { status: ReturnType<typeof vi.fn> }) {
		expect(res.status).toHaveBeenCalledTimes(1);
		const [code] = res.status.mock.calls[0];
		expect(code).toBeGreaterThanOrEqual(400);
		expect(code).toBeLessThan(500);
	}

	it('answers a direct_post with an unknown state with a 4xx instead of rejecting', async () => {
		const service = createService();
		const ctx = createContext({ state: 'unknown-state', vp_token: 'token' });

		await expect(service.responseHandler(ctx)).resolves.toBeUndefined();

		expectClientError(ctx.res);
	});

	it('answers a replayed direct_post for a completed flow with a 4xx instead of rejecting', async () => {
		const service = createService();
		// what a successful first direct_post leaves behind; a wallet retry hits this
		await service.openid4vp.saveRPState('completed-state', {
			session_id: 'completed-state',
			completed: true,
		} as any);
		const ctx = createContext({ state: 'completed-state', vp_token: 'token' });

		await expect(service.responseHandler(ctx)).resolves.toBeUndefined();

		expectClientError(ctx.res);
	});

	it('answers an encrypted response with an unknown kid with a 4xx instead of rejecting', async () => {
		const service = createService();
		const header = Buffer.from(JSON.stringify({ kid: 'unknown-kid' })).toString('base64url');
		const ctx = createContext({ response: `${header}.a.b.c.d` });

		await expect(service.responseHandler(ctx)).resolves.toBeUndefined();

		expectClientError(ctx.res);
	});
});
