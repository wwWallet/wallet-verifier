import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

describe('config', () => {
	const originalCwd = process.cwd();
	const originalEnv = process.env;
	const rootCa = 'synthetic-root-ca\n';
	let directory: string;

	beforeAll(() => {
		directory = mkdtempSync(path.join(tmpdir(), 'verifier-config-'));
		mkdirSync(path.join(directory, 'keys'));
	});

	beforeEach(() => {
		// Exercise real dotenv and file loading without reading local configuration.
		process.chdir(directory);
		process.env = {};
		writeFileSync(path.join(directory, 'keys/ca.crt'), rootCa);
		vi.resetModules();
	});

	afterEach(() => {
		process.env = originalEnv;
		process.chdir(originalCwd);
		vi.resetModules();
		rmSync(path.join(directory, '.env'), { force: true });
	});

	afterAll(() => {
		if (directory) rmSync(directory, { recursive: true, force: true });
	});

	async function importConfig() {
		return (await import('.')).config;
	}

	it('uses the documented defaults and loads the trusted root certificate', async () => {
		const config = await importConfig();
		expect(config.url).toBe('http://localhost:8005');
		expect(config.port).toBe(8005);
		expect(config.db).toEqual({
			host: '127.0.0.1',
			port: '3307',
			username: 'root',
			password: 'root',
			dbname: 'verifier',
		});
		expect(config.presentationFlow.response_mode).toBe('direct_post.jwt');
		expect(config.wwwalletURL).toBe('http://localhost:3000/cb');
		expect(config.trustedRootCertificates).toEqual([rootCa]);
		expect(config.trustedIssuers).toEqual(['http://localhost:8003/openid']);
		expect(config.sessionIdCookieConfiguration).toEqual({ maxAge: 900000, secure: false });
		expect(config.clockTolerance).toBe(60);
		expect(config.siteConfig).toEqual({
			name: 'wwWallet Verifier',
			short_name: 'wwWallet Verifier',
			theme_color: '#4d7e3e',
			background_color: '#4d7e3e',
		});
	});

	it('reads explicit settings and preserves their expected types', async () => {
		process.env = {
			SERVICE_URL: 'https://verifier.example',
			SERVICE_PORT: '9005',
			APP_SECRET: 'synthetic-test-secret',
			DB_HOST: 'database.invalid',
			DB_PORT: '3306',
			DB_USERNAME: 'unit-test',
			DB_PASSWORD: 'synthetic-password',
			DB_NAME: 'unit-test',
			PRESENTATION_FLOW_RESPONSE_MODE: 'direct_post',
			WWWALLET_URL: 'https://wallet.example/cb',
			TRUSTED_ISSUERS: 'https://one.example,https://two.example',
			SESSION_ID_COOKIE_MAX_AGE: '120000',
			SESSION_ID_COOKIE_SECURE: 'true',
			CLOCK_TOLERANCE: '30',
			SITE_NAME: 'Test verifier',
			SITE_SHORT_NAME: 'Test',
			SITE_THEME_COLOR: '#123456',
			SITE_BACKGROUND_COLOR: '#abcdef',
		};
		const config = await importConfig();
		expect(config.url).toBe('https://verifier.example');
		expect(config.port).toBe(9005);
		expect(config.appSecret).toBe('synthetic-test-secret');
		expect(config.db).toEqual({
			host: 'database.invalid',
			port: '3306',
			username: 'unit-test',
			password: 'synthetic-password',
			dbname: 'unit-test',
		});
		expect(config.presentationFlow.response_mode).toBe('direct_post');
		expect(config.wwwalletURL).toBe('https://wallet.example/cb');
		expect(config.trustedIssuers).toEqual(['https://one.example', 'https://two.example']);
		expect(config.sessionIdCookieConfiguration).toEqual({ maxAge: 120000, secure: true });
		expect(config.clockTolerance).toBe(30);
		expect(config.siteConfig).toEqual({
			name: 'Test verifier',
			short_name: 'Test',
			theme_color: '#123456',
			background_color: '#abcdef',
		});
	});

	it.each(['false', 'TRUE', '1'])('keeps secure cookies disabled for %j', async (value) => {
		process.env.SESSION_ID_COOKIE_SECURE = value;
		expect((await importConfig()).sessionIdCookieConfiguration.secure).toBe(false);
	});

	it('loads .env settings while giving environment variables precedence', async () => {
		writeFileSync(
			path.join(directory, '.env'),
			'SERVICE_URL=https://from-file.example\nSERVICE_PORT=9000\nSITE_THEME_COLOR="#123456"\n',
		);
		process.env.SERVICE_PORT = '9005';
		const config = await importConfig();
		expect(config.url).toBe('https://from-file.example');
		expect(config.port).toBe(9005);
		expect(config.siteConfig.theme_color).toBe('#123456');
	});

	it('fails to load when the required root CA file is missing', async () => {
		rmSync(path.join(directory, 'keys/ca.crt'));
		await expect(importConfig()).rejects.toThrow(/ENOENT/);
	});
});
