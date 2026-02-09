import { Request, Response } from 'express'
import { OpenidForPresentationsReceivingInterface, VerifierConfigurationInterface } from "./interfaces";
import base64url from "base64url";
import { config } from "../../config";
import fs from 'fs';
import path from "path";
import * as z from 'zod';
import { pemToBase64 } from "../util/pemToBase64";
import { MemoryStore, OpenID4VPClientErrors, OpenID4VPClientAPI, RPState, OpenID4VPResponseMode } from 'wallet-common';
import { defaultHttpClient } from 'wallet-common/dist/defaultHttpClient';
import { webcrypto } from "node:crypto";
import AppDataSource from '../AppDataSource';
import { Audit } from '../entities/Audit.entity';

const privateKeyPem = fs.readFileSync(path.join(__dirname, "../../../keys/pem.key"), 'utf-8').toString();
const leafCert = fs.readFileSync(path.join(__dirname, "../../../keys/pem.crt"), 'utf-8').toString();



const x5c = [
	pemToBase64(leafCert),
];

const ResponseModeSchema = z.nativeEnum(OpenID4VPResponseMode);

// @ts-ignore
const response_mode: ResponseMode = config?.presentationFlow?.response_mode ? ResponseModeSchema.parse(config?.presentationFlow?.response_mode) : ResponseMode.DIRECT_POST_JWT;

export class OpenidForPresentationsReceivingService implements OpenidForPresentationsReceivingInterface {
	private static rpStateKV: MemoryStore<string, RPState | string> = new MemoryStore();
	public openid4vp: OpenID4VPClientAPI;

	constructor(
		private configurationService: VerifierConfigurationInterface,
	) {
		const trustedCredentialIssuerIdentifiers = config.trustedIssuers as string[] | undefined;
		this.openid4vp = new OpenID4VPClientAPI(
			OpenidForPresentationsReceivingService.rpStateKV,
			{
				redirectUri: this.configurationService.getConfiguration().redirect_uri, credentialEngineOptions: {
					// @ts-ignore
					clockTolerance: config.clockTolerance ?? 60,
					subtle: webcrypto.subtle as SubtleCrypto,
					lang: 'en-US',
					trustedCertificates: [...config.trustedRootCertificates] as string[],
					trustedCredentialIssuerIdentifiers: trustedCredentialIssuerIdentifiers
				},
			},
			defaultHttpClient
		);
	}


	private async createAuditEntry(params: { sessionId: string; crossDevice: boolean; dcqlQuery: Record<string, unknown> | null }): Promise<void> {
		if (!AppDataSource.isInitialized) {
			console.warn("Audit skipped: data source not initialized");
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
			console.warn("Audit update skipped: data source not initialized");
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

	public async getSignedRequestObject(ctx: { req: Request, res: Response }): Promise<any> {
		if (!ctx.req.query['id'] || typeof ctx.req.query['id'] != 'string') {
			return ctx.res.status(500).send({ error: "id does not exist on query params" });
		}

		const signedRequestResult = await this.openid4vp.getSignedRequestObject(ctx.req.query['id'])

		if (!signedRequestResult.ok) {
			const { error, error_description } = signedRequestResult;
			if (error === OpenID4VPClientErrors.MissingRPState) {
				return ctx.res.status(500).send({ error, error_description});
			}
			if (error === OpenID4VPClientErrors.SignedRequestObjectInvalidated) {
				return ctx.res.status(500).send({ error, error_description });
			}
			return ctx.res.status(500).send({ error: "unknown error"});
		}
		const signedRequest = signedRequestResult.value;
		return ctx.res.send(signedRequest.toString());
	}

	async generateAuthorizationRequestURL(presentationRequest: any, sessionId: string, callbackEndpoint?: string): Promise<{ url: URL; stateId: string }> {
		const generated = await this.openid4vp.generateAuthorizationRequestURL(
			presentationRequest,
			sessionId,
			this.configurationService.getConfiguration().redirect_uri,
			config.url,
			privateKeyPem,
			x5c,
			response_mode,
			callbackEndpoint
		);
		await this.createAuditEntry({
			sessionId,
			crossDevice: generated.rpState.is_cross_device,
			dcqlQuery: presentationRequest?.dcql_query ?? null,
		});
		return {url: generated.url, stateId: generated.stateId}
	}

	async responseHandler(ctx: { req: Request, res: Response }): Promise<void> {
		// let presentationSubmissionObject: PresentationSubmission | null = qs.parse(decodeURI(presentation_submission)) as any;
		let vp_token = ctx.req.body?.vp_token;
		let state = ctx.req.body?.state;
		let presentation_submission = ctx.req.body.presentation_submission ? JSON.parse(decodeURI(ctx.req.body.presentation_submission)) as any : null;


		if (ctx.req.body.response) { // E2EE - JARM
			const { kid } = JSON.parse(base64url.decode(ctx.req.body.response.split('.')[0])) as { kid: string | undefined };
			if (!kid) {
				throw new Error("Could not extract kid");
			}

			const rpStateResult = await this.openid4vp.handleResponseJARM(ctx.req.body.response, kid);

			if (!rpStateResult.ok) {
				const { error, error_description } = rpStateResult;
				const rpStateFromKid = await this.openid4vp.getRPStateByKid(kid);
				if (rpStateFromKid) {
					await this.updateAuditEntry(rpStateFromKid.session_id, { errorCode: error });
				}

				if (error === OpenID4VPClientErrors.JWEDecryptionFailure) {
					ctx.res.status(500).send({ error, error_description });
					return;
				}

				throw new Error(error_description ?? error);
			}

			const rpState = rpStateResult.value;
			await this.updateAuditEntry(rpState.session_id, { completed: true, errorCode: null });
			if (!rpState.is_cross_device) {
				ctx.res.send({ redirect_uri: rpState.callback_endpoint + '#response_code=' + rpState.response_code })
				return;
			}

			// in cross-device scenario just return an empty response
			ctx.res.send();
			return;
		}

		// non E2EE scenario
		if (!state) {
			console.log("Missing state param");
			ctx.res.status(401).send({ error: "Missing state param" });
			return;
		}

		if (!vp_token) {
			console.log("Missing state param");
			await this.updateAuditEntry(state, { errorCode: "Missing vp_token" });
			ctx.res.status(401).send({ error: "Missing vp_token" });
			return;
		}

		const rpStateResult = await this.openid4vp.handleResponseDirectPost(
			state,
			vp_token,
			presentation_submission
		);

		if (!rpStateResult.ok) {
			const { error, error_description } = rpStateResult;
			await this.updateAuditEntry(state, { errorCode: error });
			throw new Error(error_description ?? error);
		}

		const rpState = rpStateResult.value;
		await this.updateAuditEntry(rpState.session_id, { completed: true, errorCode: null });
		ctx.res.send({ redirect_uri: rpState.callback_endpoint + '#response_code=' + rpState.response_code })
		return;
	}
}
