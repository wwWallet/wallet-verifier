import { Request, Response } from 'express';
import {
	OpenidForPresentationsReceivingInterface,
	VerifierConfigurationInterface,
} from './interfaces';
import base64url from 'base64url';
import { config } from '../../config';
import fs from 'fs';
import path from 'path';
import * as z from 'zod';
import { pemToBase64 } from '../util/pemToBase64';
import {
	MemoryStore,
	OpenID4VPClientErrors,
	OpenID4VPClientAPI,
	RPState,
	OpenID4VPResponseMode,
} from 'wallet-common';
import { defaultHttpClient } from 'wallet-common/dist/defaultHttpClient';
import { webcrypto } from 'node:crypto';
import AppDataSource from '../AppDataSource';
import { Audit } from '../entities/Audit.entity';
import { logger } from '../logger';
import { flowId } from '../util/flowId';

const log = logger.child({ module: 'OpenID4VP' });

const privateKeyPem = fs
	.readFileSync(path.join(__dirname, '../../../keys/pem.key'), 'utf-8')
	.toString();
const leafCert = fs.readFileSync(path.join(__dirname, '../../../keys/pem.crt'), 'utf-8').toString();

const x5c = [pemToBase64(leafCert)];

const ResponseModeSchema = z.enum(OpenID4VPResponseMode);

const response_mode: OpenID4VPResponseMode = config?.presentationFlow?.response_mode
	? ResponseModeSchema.parse(config?.presentationFlow?.response_mode)
	: OpenID4VPResponseMode.DIRECT_POST_JWT;

export class OpenidForPresentationsReceivingService implements OpenidForPresentationsReceivingInterface {
	private static rpStateKV: MemoryStore<string, RPState | string> = new MemoryStore();
	public openid4vp: OpenID4VPClientAPI;

	constructor(private configurationService: VerifierConfigurationInterface) {
		const trustedCredentialIssuerIdentifiers = config.trustedIssuers as string[] | undefined;
		this.openid4vp = new OpenID4VPClientAPI(
			OpenidForPresentationsReceivingService.rpStateKV,
			{
				redirectUri: this.configurationService.getConfiguration().redirect_uri,
				credentialEngineOptions: {
					// @ts-ignore
					clockTolerance: config.clockTolerance ?? 60,
					subtle: webcrypto.subtle,
					lang: 'en-US',
					trustedCertificates: [...config.trustedRootCertificates] as string[],
					trustedCredentialIssuerIdentifiers: trustedCredentialIssuerIdentifiers,
				},
			},
			defaultHttpClient,
		);
	}

	private async createAuditEntry(params: {
		sessionId: string;
		crossDevice: boolean;
		dcqlQuery: Record<string, unknown> | null;
	}): Promise<void> {
		if (!AppDataSource.isInitialized) {
			log.warn('Audit skipped: data source not initialized');
			return;
		}
		const auditRepository = AppDataSource.getRepository(Audit);
		const entry = auditRepository.create({
			sessionId: params.sessionId,
			crossDevice: params.crossDevice,
			dcqlQuery: params.dcqlQuery,
			completed: false,
			errorCode: null,
		});
		await auditRepository.save(entry);
	}

	private async updateAuditEntry(sessionId: string, update: Partial<Audit>): Promise<void> {
		if (!AppDataSource.isInitialized) {
			log.warn('Audit update skipped: data source not initialized');
			return;
		}
		const auditRepository = AppDataSource.getRepository(Audit);
		const existing = await auditRepository.findOneBy({ sessionId });
		if (!existing) {
			return;
		}
		Object.assign(existing, update);
		await auditRepository.save(existing);
	}

	public async setAuditCrossDevice(sessionId: string, crossDevice: boolean): Promise<void> {
		await this.updateAuditEntry(sessionId, { crossDevice });
	}

	public async getSignedRequestObject(ctx: { req: Request; res: Response }): Promise<any> {
		if (!ctx.req.query['id'] || typeof ctx.req.query['id'] != 'string') {
			return ctx.res.status(400).send({ error: 'id does not exist on query params' });
		}

		const flow = flowId(ctx.req.query['id']);
		const signedRequestResult = await this.openid4vp.getSignedRequestObject(ctx.req.query['id']);

		if (!signedRequestResult.ok) {
			const { error, error_description } = signedRequestResult;
			log.warn({ flow, error }, 'Request object not served');
			if (error === OpenID4VPClientErrors.MissingRPState) {
				return ctx.res.status(404).send({ error, error_description });
			}
			if (error === OpenID4VPClientErrors.SignedRequestObjectInvalidated) {
				return ctx.res.status(400).send({ error, error_description });
			}
			return ctx.res.status(500).send({ error: 'unknown error' });
		}
		const signedRequest = signedRequestResult.value;
		log.info({ flow }, 'Request object fetched by wallet');
		return ctx.res.send(signedRequest.toString());
	}

	async generateAuthorizationRequestURL(
		presentationRequest: any,
		sessionId: string,
		callbackEndpoint?: string,
		clientIdPrefix?: string,
	): Promise<{ url: URL; stateId: string }> {
		const generated = await this.openid4vp.generateAuthorizationRequestURL(
			presentationRequest,
			sessionId,
			this.configurationService.getConfiguration().redirect_uri,
			config.url,
			privateKeyPem,
			x5c,
			response_mode,
			callbackEndpoint,
			clientIdPrefix === 'x509_hash' || clientIdPrefix === 'x509_san_dns'
				? clientIdPrefix
				: 'x509_san_dns',
		);
		await this.createAuditEntry({
			sessionId,
			crossDevice: generated.rpState.is_cross_device,
			dcqlQuery: presentationRequest?.dcql_query ?? null,
		});
		const requestedCredentials = presentationRequest?.dcql_query?.credentials;
		log.info(
			{
				flow: flowId(sessionId),
				response_mode,
				client_id_prefix: clientIdPrefix ?? 'x509_san_dns',
				credentials: Array.isArray(requestedCredentials)
					? requestedCredentials.map((c: { id?: string }) => c.id)
					: undefined,
			},
			'Presentation request created',
		);
		return { url: generated.url, stateId: generated.stateId };
	}

	async responseHandler(ctx: { req: Request; res: Response }): Promise<void> {
		// let presentationSubmissionObject: PresentationSubmission | null = qs.parse(decodeURI(presentation_submission)) as any;
		let vp_token = ctx.req.body?.vp_token;
		let state = ctx.req.body?.state;
		let presentation_submission;
		try {
			presentation_submission = ctx.req.body?.presentation_submission
				? (JSON.parse(decodeURI(ctx.req.body?.presentation_submission)) as any)
				: null;
		} catch {
			log.warn('direct_post with malformed presentation_submission');
			ctx.res.status(400).send({ error: 'Malformed presentation_submission' });
			return;
		}

		if (ctx.req.body?.response) {
			// E2EE
			let kid: string | undefined;
			try {
				({ kid } = JSON.parse(base64url.decode(ctx.req.body?.response.split('.')[0])) as {
					kid: string | undefined;
				});
			} catch {
				// not a compact JWE with a JSON header
			}
			if (!kid) {
				log.warn({ encrypted: true }, 'direct_post response without a kid');
				ctx.res.status(400).send({ error: 'Could not extract kid' });
				return;
			}

			const rpStateResult = await this.openid4vp.handleEncryptedAuthorizationResponse(
				ctx.req.body?.response,
				kid,
			);

			if (!rpStateResult.ok) {
				const { error, error_description } = rpStateResult;
				const rpStateFromKid = await this.openid4vp.getRPStateByKid(kid);
				if (rpStateFromKid) {
					await this.updateAuditEntry(rpStateFromKid.session_id, { errorCode: error });
				}
				log.warn(
					{
						flow: rpStateFromKid ? flowId(rpStateFromKid.session_id) : undefined,
						encrypted: true,
						error,
						error_description,
					},
					'Presentation response rejected',
				);

				ctx.res.status(400).send({ error, error_description });
				return;
			}

			const rpState = rpStateResult.value;
			await this.updateAuditEntry(rpState.session_id, { completed: true, errorCode: null });
			log.info(
				{
					flow: flowId(rpState.session_id),
					encrypted: true,
					cross_device: rpState.is_cross_device,
				},
				'Presentation response received',
			);
			if (!rpState.is_cross_device) {
				ctx.res.send({
					redirect_uri: rpState.callback_endpoint + '#response_code=' + rpState.response_code,
				});
				return;
			}

			// in cross-device scenario just return an empty response
			ctx.res.send();
			return;
		}

		// non E2EE scenario
		if (!state || typeof state !== 'string') {
			log.warn('direct_post without valid state');
			ctx.res.status(401).send({ error: 'Missing state param' });
			return;
		}

		if (!vp_token) {
			log.warn({ flow: flowId(state) }, 'direct_post without vp_token');
			await this.updateAuditEntry(state, { errorCode: 'Missing vp_token' });
			ctx.res.status(401).send({ error: 'Missing vp_token' });
			return;
		}

		const rpStateResult = await this.openid4vp.handleResponseDirectPost(
			state,
			vp_token,
			presentation_submission,
		);

		if (!rpStateResult.ok) {
			const { error, error_description } = rpStateResult;
			await this.updateAuditEntry(state, { errorCode: error });
			log.warn(
				{ flow: flowId(state), encrypted: false, error, error_description },
				'Presentation response rejected',
			);
			ctx.res.status(400).send({ error, error_description });
			return;
		}

		const rpState = rpStateResult.value;
		await this.updateAuditEntry(rpState.session_id, { completed: true, errorCode: null });
		// stored only: the vp_token is validated later, when the result is fetched (see /verifier/callback)
		log.info(
			{
				flow: flowId(rpState.session_id),
				encrypted: false,
				cross_device: rpState.is_cross_device,
			},
			'Presentation response received',
		);
		ctx.res.send({
			redirect_uri: rpState.callback_endpoint + '#response_code=' + rpState.response_code,
		});
		return;
	}
}
