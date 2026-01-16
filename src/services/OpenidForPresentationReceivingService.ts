import { Request, Response } from 'express'
import { OpenidForPresentationsReceivingInterface, VerifierConfigurationInterface, PresentationInfo } from "./interfaces";
import { VerifiableCredentialFormat } from "wallet-common/dist/types";
import { compactDecrypt, CompactDecryptResult, exportJWK, generateKeyPair, importJWK, importPKCS8, SignJWT } from "jose";
import { randomUUID } from "crypto";
import base64url from "base64url";
import { config } from "../../config";
import fs from 'fs';
import path from "path";
import { PresentationClaims } from "../entities/RelyingPartyState.entity";
import { generateRandomIdentifier } from "../util/generateRandomIdentifier";
import * as z from 'zod';
import { initializeCredentialEngine } from "../util/initializeCredentialEngine";
import { TransactionData } from "../util/transactionData";
import { serializeDcqlQuery } from "../util/serializeDcqlQuery";
import { DcqlPresentationResult } from 'dcql';
import { pemToBase64 } from "../util/pemToBase64";
import { RPState } from '../types/RPState';
import { KeyValueStore } from '../KeyValueStore';

const privateKeyPem = fs.readFileSync(path.join(__dirname, "../../../keys/pem.key"), 'utf-8').toString();
const leafCert = fs.readFileSync(path.join(__dirname, "../../../keys/pem.crt"), 'utf-8').toString();

enum ResponseMode {
	DIRECT_POST = 'direct_post',
	DIRECT_POST_JWT = 'direct_post.jwt'
}

const RESERVED_SDJWT_TOPLEVEL = new Set([
	'iss', 'sub', 'aud', 'nbf', 'exp', 'iat', 'jti', 'vct', 'cnf',
	'transaction_data_hashes', 'transaction_data_hashes_alg', 'vct#integrity'
]);

const x5c = [
	pemToBase64(leafCert),
];

const ResponseModeSchema = z.nativeEnum(ResponseMode);

// @ts-ignore
const response_mode: ResponseMode = config?.presentationFlow?.response_mode ? ResponseModeSchema.parse(config?.presentationFlow?.response_mode) : ResponseMode.DIRECT_POST_JWT;

export class OpenidForPresentationsReceivingService implements OpenidForPresentationsReceivingInterface {
	private rpStateKV: KeyValueStore<any>;
	constructor(
		private configurationService: VerifierConfigurationInterface,
	) {
		this.rpStateKV = new KeyValueStore<any>();
	}

	public async getSignedRequestObject(ctx: { req: Request, res: Response }): Promise<any> {
		if (!ctx.req.query['id'] || typeof ctx.req.query['id'] != 'string') {
			return ctx.res.status(500).send({ error: "id does not exist on query params" });
		}

		const rpStateRaw = this.rpStateKV.get(`rpstate:${ctx.req.query['id']}`);

		if (!rpStateRaw) {
			return ctx.res.status(500).send({ error: "rpState state could not be fetched with this id" });
		}

		const rpState = JSON.parse(rpStateRaw) as RPState;

		if (rpState.signed_request === "") {
			return ctx.res.status(500).send({ error: "rpState state signed request object has been invalidated" });
		}
		const signedRequest = rpState.signed_request;
		rpState.signed_request = "";
		// await this.rpStateRepository.save(rpState);
		this.rpStateKV.set(`rpstate:${ctx.req.query['id']}`, JSON.stringify(rpState));
		return ctx.res.send(signedRequest.toString());
	}

	async generateAuthorizationRequestURL(presentationRequest: any, sessionId: string, callbackEndpoint?: string): Promise<{ url: URL; stateId: string }> {
		// create cookie and add it to response

		console.log("Presentation Request: Session id used for authz req ", sessionId);

		const nonce = randomUUID();
		const state = sessionId;

		const responseUri = this.configurationService.getConfiguration().redirect_uri;
		const client_id = new URL(responseUri).hostname

		const [rsaImportedPrivateKey, rpEphemeralKeypair] = await Promise.all([
			importPKCS8(privateKeyPem, 'ES256'),
			generateKeyPair('ECDH-ES')
		]);
		const [exportedEphPub, exportedEphPriv] = await Promise.all([
			exportJWK(rpEphemeralKeypair.publicKey),
			exportJWK(rpEphemeralKeypair.privateKey)
		]);

		exportedEphPub.kid = generateRandomIdentifier(8);
		exportedEphPriv.kid = exportedEphPub.kid;
		exportedEphPub.use = 'enc';
		let transactionDataObject: any[] = [];
		if (presentationRequest?.dcql_query?.credentials) {
			transactionDataObject = await Promise.all(presentationRequest?.dcql_query?.credentials
				.filter((cred: any) => cred._transaction_data_type !== undefined)
				.map(async (cred: any) => {
					if (!cred._transaction_data_type) {
						return null;
					}
					const txData = TransactionData(cred._transaction_data_type);
					if (!txData) {
						return null;
					}
					return await txData
						.generateTransactionDataRequestObject(cred.id);
				}));
		}

		transactionDataObject = transactionDataObject.filter((td) => td !== null);
		const signedRequestObject = await new SignJWT({
			response_uri: responseUri,
			aud: "https://self-issued.me/v2",
			iss: new URL(responseUri).hostname,
			client_id: "x509_san_dns:" + client_id,
			response_type: "vp_token",
			response_mode: response_mode,
			state: state,
			nonce: nonce,
			dcql_query: presentationRequest?.dcql_query?.credentials ? serializeDcqlQuery(JSON.parse(JSON.stringify(presentationRequest.dcql_query))) : null,
			client_metadata: {
				"jwks": {
					"keys": [
						exportedEphPub
					]
				},
				"authorization_encrypted_response_alg": "ECDH-ES",
				"authorization_encrypted_response_enc": "A256GCM",
				"vp_formats": {
					"vc+sd-jwt": {
						"sd-jwt_alg_values": [
							"ES256",
						],
						"kb-jwt_alg_values": [
							"ES256",
						]
					},
					"dc+sd-jwt": {
						"sd-jwt_alg_values": [
							"ES256",
						],
						"kb-jwt_alg_values": [
							"ES256",
						]
					},
					"mso_mdoc": {
						"alg": ["ES256"]
					}
				}
			},
			transaction_data: transactionDataObject.length > 0 ? transactionDataObject : undefined
		})
			.setIssuedAt()
			.setProtectedHeader({
				alg: 'ES256',
				x5c: x5c,
				typ: 'oauth-authz-req+jwt',
			})
			.sign(rsaImportedPrivateKey);
		const redirectUri = "openid4vp://cb";

		const newRpState: RPState = {
			session_id: sessionId,
			is_cross_device: false, // TODO
			signed_request: signedRequestObject,
			state,
			nonce,

			callback_endpoint: callbackEndpoint ?? null,

			audience: `x509_san_dns:${client_id}`,
			presentation_request_id:
				presentationRequest.id ??
				(presentationRequest.dcql_query as any)?.credentials?.[0]?.id,

			presentation_definition: null,
			dcql_query: presentationRequest?.dcql_query ?? null,

			rp_eph_kid: exportedEphPub.kid ?? "",
			rp_eph_pub: exportedEphPub,
			rp_eph_priv: exportedEphPriv,

			apv_jarm_encrypted_response_header: null,
			apu_jarm_encrypted_response_header: null,

			encrypted_response: null,
			vp_token: null,

			presentation_submission: null,
			response_code: null,

			claims: null,
			completed: null,
			presentation_during_issuance_session: null,

			date_created: Date.now(),
			};

		this.rpStateKV.set("rpstate:" + sessionId, JSON.stringify(newRpState));
		this.rpStateKV.set("key:" + exportedEphPub.kid, sessionId);

		// await this.rpStateRepository.save(newRpState);

		const requestUri = config.url + "/verification/request-object?id=" + state;

		const redirectParameters = {
			client_id: "x509_san_dns:" + client_id,
			request_uri: requestUri
		};

		const searchParams = new URLSearchParams(redirectParameters);
		const authorizationRequestURL = new URL(redirectUri + "?" + searchParams.toString()); // must be openid4vp://cb

		console.log("AUTHZ REQ = ", authorizationRequestURL);
		return { url: authorizationRequestURL, stateId: state };
	}

	async responseHandler(ctx: { req: Request, res: Response }): Promise<void> {
		// let presentationSubmissionObject: PresentationSubmission | null = qs.parse(decodeURI(presentation_submission)) as any;
		let vp_token = ctx.req.body?.vp_token;
		let state = ctx.req.body?.state;
		let presentation_submission = ctx.req.body.presentation_submission ? JSON.parse(decodeURI(ctx.req.body.presentation_submission)) as any : null;


		if (ctx.req.body.response) { // E2EE - JARM
			const { kid } = JSON.parse(base64url.decode(ctx.req.body.response.split('.')[0])) as { kid: string | undefined };
			if (!kid) {
				throw new Error("Couldnt extract kid");
			}
			// get rpstate only to get the private key to decrypt the response

			// match kid with rpstate
			const kidToRP = this.rpStateKV.get("key:" + kid);
			if (!kidToRP) {
				throw new Error("responseHandler: Could not retrieve rpState from kid");
			}
			const rpStateRaw = this.rpStateKV.get(`rpstate:${kidToRP}`)
			if (!rpStateRaw) {
				throw new Error("responseHandler: Could not retrieve rpState");
			}
			let rpState = JSON.parse(rpStateRaw) as RPState;

			const rp_eph_priv = await importJWK(rpState.rp_eph_priv, 'ECDH-ES');
			const result = await compactDecrypt(ctx.req.body.response, rp_eph_priv).then((r) => ({ data: r, err: null })).catch((err) => ({ data: null, err: err }));
			if (result.err) {
				const error = { error: "JWE Decryption failure", error_description: result.err };
				console.error(error);
				console.log("Received JWE headers: ", JSON.parse(base64url.decode(ctx.req.body.response.split('.')[0])));
				console.log("Received JWE: ", ctx.req.body.response);
				ctx.res.status(500).send(error);
				return;
			}

			const { protectedHeader, plaintext } = result.data as CompactDecryptResult;
			console.log("Protected header = ", protectedHeader)
			const payload = JSON.parse(new TextDecoder().decode(plaintext)) as { state: string | undefined, vp_token: string | undefined, presentation_submission: any };
			if (!payload?.state) {
				throw new Error("Missing state");
			}

			if (rpState.completed) {
				throw new Error("Presentation flow already completed");
			}

			if (!payload.vp_token) {
				throw new Error("Encrypted Response: vp_token is missing");
			}

			if (!payload.presentation_submission && !payload.vp_token) {
				throw new Error("Encrypted Response: presentation_submission and vp_token are missing");
			}
			rpState.response_code = base64url.encode(randomUUID());
			rpState.encrypted_response = ctx.req.body.response;
			rpState.presentation_submission = payload.presentation_submission;
			console.log("Encoding....")
			rpState.vp_token = base64url.encode(JSON.stringify(payload.vp_token));
			rpState.date_created = Date.now();
			rpState.apv_jarm_encrypted_response_header = protectedHeader.apv && typeof protectedHeader.apv == 'string' ? protectedHeader.apv as string : null;
			rpState.apu_jarm_encrypted_response_header = protectedHeader.apu && typeof protectedHeader.apu == 'string' ? protectedHeader.apu as string : null;
			rpState.completed = true;

			console.log("Stored rp state = ", rpState)
			//await this.rpStateRepository.save(rpState);
			this.rpStateKV.set("rpstate:" + rpState.session_id, JSON.stringify(rpState));

			if (!rpState.is_cross_device) {
				ctx.res.send({ redirect_uri: rpState.callback_endpoint + '#response_code=' + rpState.response_code })
				return;
			}
			// in cross-device scenario just return an empty response
			ctx.res.send();
			return;
		}

		if (!state) {
			console.log("Missing state param");
			ctx.res.status(401).send({ error: "Missing state param" });
			return;
		}

		if (!vp_token) {
			console.log("Missing state param")
			ctx.res.status(401).send({ error: "Missing state param" });
			return;
		}

		// get rpState using the state value
		const rpStateRaw = this.rpStateKV.get(`rpstate:${state}`)
		if (!rpStateRaw) {
			throw new Error("Couldn't get rp state with state");
		}
		const rpState = JSON.parse(rpStateRaw) as RPState;
		if (rpState.completed) {
			throw new Error("Presentation flow already completed");
		}
		rpState.response_code = base64url.encode(randomUUID());
		rpState.presentation_submission = presentation_submission;
		rpState.vp_token = base64url.encode(JSON.stringify(vp_token));
		rpState.date_created = Date.now();
		rpState.completed = true;

		console.log("Session id = ", rpState.session_id)
		//await this.rpStateRepository.save(rpState);
		this.rpStateKV.set(`rpstate:${rpState.session_id}`, JSON.stringify(rpState));
		ctx.res.send({ redirect_uri: rpState.callback_endpoint + '#response_code=' + rpState.response_code })
		return;
	}

	private async validateDcqlVpToken(
		vp_token_list: any,
		dcql_query: any,
		rpState: RPState
	): Promise<{ presentationClaims?: PresentationClaims, messages?: PresentationInfo, error?: Error }> {
		const presentationClaims: PresentationClaims = {};
		const ce = await initializeCredentialEngine();
		const messages: PresentationInfo = {};

		for (const descriptor of dcql_query.credentials) {
			const vp = vp_token_list[descriptor.id];
			if (!vp) {
				return { error: new Error(`Missing VP for descriptor ${descriptor.id}`) };
			}

			try {
				// detect if SD-JWT (has ~) or mdoc (CBOR-encoded)
				if (typeof vp === 'string' && vp.includes('~')) {
					// ========== SD-JWT ==========
					try {
						const [kbjwt] = vp.split('~').reverse();
						const [_kbjwtEncodedHeader, kbjwtEncodedPayload, _kbjwtSig] = kbjwt.split('.');
						const kbjwtPayload = JSON.parse(base64url.decode(kbjwtEncodedPayload)) as Record<string, unknown>;
						if (Object.keys(kbjwtPayload).includes('transaction_data_hashes') && descriptor._transaction_data_type !== undefined) {
							const txData = TransactionData(descriptor._transaction_data_type);
							if (!txData) {
								return { error: new Error("specific transaction_data not supported error") };
							}
							const { status, message } = await txData.validateTransactionDataResponse(descriptor.id, {
								transaction_data_hashes: (kbjwtPayload as any).transaction_data_hashes as string[],
								transaction_data_hashes_alg: (kbjwtPayload as any).transaction_data_hashes_alg as string[] | undefined
							});
							console.log("Message: ", message)
							messages[descriptor.id] = [ message ];
							if (!status) {
								return { error: new Error("transaction_data validation error") };
							}
							console.log("VALIDATED TRANSACTION DATA");
						}
						else if (descriptor._transaction_data_type !== undefined) {
							return { error: new Error("transaction_data_hashes is missing from transaction data response") };
						}
					} catch (e) {
						console.error(e);
						return { error: new Error("transaction_data validation error") };
					}
					const verificationResult = await ce.sdJwtVerifier.verify({
						rawCredential: vp,
						opts: {
							expectedAudience: rpState.audience,
							expectedNonce: rpState.nonce,
						},
					});
					if (!verificationResult.success) {
						return { error: new Error(`SD-JWT verification failed for ${descriptor.id}: ${verificationResult.error}`) };
					}

					const parseResult = await ce.credentialParsingEngine.parse({ rawCredential: vp });
					if (!parseResult.success) {
						return { error: new Error(`Parsing SD-JWT failed for ${descriptor.id}: ${parseResult.error}`) };
					}

					const signedClaims = parseResult.value.signedClaims;
					const shaped = {
						vct: signedClaims.vct,
						credential_format: VerifiableCredentialFormat.DC_SDJWT,
						claims: signedClaims,
						cryptographic_holder_binding: true
					};

					const dcqlResult = DcqlPresentationResult.fromDcqlPresentation(
						{ [descriptor.id]: [shaped] },
						{ dcqlQuery: dcql_query }
					);
					if (!dcqlResult.credential_matches[descriptor.id]?.success) {
						return { error: new Error(`DCQL validation failed for ${descriptor.id}`) };
					}

					const output = dcqlResult.credential_matches[descriptor.id].valid_credentials?.[0].meta.output as any;
					if (
						output.credential_format === VerifiableCredentialFormat.VC_SDJWT ||
						output.credential_format === VerifiableCredentialFormat.DC_SDJWT
					) {
						const claims = dcqlResult.credential_matches[descriptor.id].valid_credentials?.[0]?.claims as any;
						const dcqlOut = claims?.valid_claim_sets?.[0]?.output as Record<string, unknown> | undefined;
						const signedClaims = parseResult.value.signedClaims as Record<string, unknown>;

						const requestedAll = descriptor?.claims == null;

						// Get all claims if no specific claims were requested
						const source: Record<string, unknown> =
							requestedAll
								? signedClaims
								: (dcqlOut && Object.keys(dcqlOut).length > 0 ? dcqlOut : signedClaims);

						const filteredSource = Object.fromEntries(
							Object.entries(source).filter(([k]) => !RESERVED_SDJWT_TOPLEVEL.has(k) && !k.startsWith('_'))
						);
						presentationClaims[descriptor.id] = Object.entries(filteredSource).map(([key, value]) => ({
							key,
							name: key,
							value: typeof value === 'object' ? JSON.stringify(value) : String(value),
						}));
					} else {
						return { error: new Error(`Unexpected credential_format for descriptor ${descriptor.id}`) };
					}
				} else {
					// ========== mdoc ==========
					const verificationResult = await ce.msoMdocVerifier.verify({
						rawCredential: vp,
						opts: {
							expectedAudience: rpState.audience,
							expectedNonce: rpState.nonce,
							holderNonce: rpState.apu_jarm_encrypted_response_header
								? base64url.decode(rpState.apu_jarm_encrypted_response_header)
								: undefined,
							responseUri: this.configurationService.getConfiguration().redirect_uri,
						},
					});
					if (!verificationResult.success) {
						return { error: new Error(`mDoc verification failed for ${descriptor.id}: ${verificationResult.error}`) };
					}

					const parseResult = await ce.credentialParsingEngine.parse({ rawCredential: vp });
					if (!parseResult.success) {
						return { error: new Error(`Parsing mDoc failed for ${descriptor.id}: ${parseResult.error}`) };
					}
					const signedClaims = parseResult.value.signedClaims;
					const shaped = {
						credential_format: VerifiableCredentialFormat.MSO_MDOC,
						doctype: descriptor.meta?.doctype_value,
						cryptographic_holder_binding: true,
						namespaces: signedClaims
					};

					const dcqlResult = DcqlPresentationResult.fromDcqlPresentation(
						{ [descriptor.id]: [shaped] },
						{ dcqlQuery: dcql_query }
					);

					if (!dcqlResult.credential_matches[descriptor.id]?.success) {
						return { error: new Error(`DCQL validation failed for mdoc descriptor ${descriptor.id}`) };
					}
					const output = dcqlResult.credential_matches[descriptor.id].valid_credentials?.[0].meta.output as any;
					if (output.credential_format === VerifiableCredentialFormat.MSO_MDOC) {
						const claimsObject = dcqlResult.credential_matches[descriptor.id].valid_credentials?.[0].claims as any;
						if (!claimsObject) {
							return { error: new Error(`No claims found in mdoc for doctype ${descriptor.meta?.doctype_value}`) };
						}
						presentationClaims[descriptor.id] = Object.entries(claimsObject.valid_claim_sets[0].output[descriptor.meta?.doctype_value]).map(([key, value]) => ({
							key,
							name: key,
							value: typeof value === 'object' ? JSON.stringify(value) : String(value),
						}));
					} else {
						return { error: new Error(`Unexpected mdoc credential_format in output for descriptor ${descriptor.id}`) };
					}
				}
			} catch (e) {
				console.error(`Error processing descriptor ${descriptor.id}:`, e);
				return { error: new Error(`Internal error verifying or parsing VP for descriptor ${descriptor.id}`) };
			}
		}
		return { presentationClaims, messages };
	}

	public async getPresentationBySessionId(sessionId?: string, cleanupSession: boolean = false): Promise<{ status: true, presentations: unknown[], presentationInfo: PresentationInfo, rpState: RPState } | { status: false, error: Error }> {
		if (!sessionId) {
			console.error("getPresentationBySessionId: Invalid sessionId");
			const error = new Error("getPresentationBySessionId: Invalid sessionId");
			return { status: false, error };
		}
		const rpStateRaw = this.rpStateKV.get(`rpstate:${sessionId}`);

		if (!rpStateRaw) {
			console.error("Couldn't get rpState with the session_id " + sessionId);
			const error = new Error("Couldn't get rpState with the session_id " + sessionId);
			return { status: false, error };
		}

		const rpState = JSON.parse(rpStateRaw) as RPState;

		if (!rpState.vp_token) {
			console.error("Presentation has not been sent. session_id " + sessionId);
			const error = new Error("Presentation has not been sent. session_id " + sessionId);
			return { status: false, error };
		}

		const vp_token = JSON.parse(base64url.decode(rpState.vp_token)) as string[] | string | Record<string, string>;

		let presentationClaims;
		let presentationInfo: PresentationInfo = {};
		let error: Error | undefined;
		if (rpState.dcql_query) {
			const result = await this.validateDcqlVpToken(vp_token as any, rpState.dcql_query, rpState);
			presentationClaims = result.presentationClaims;
			presentationInfo = result.messages ? result.messages : {};
			error = result.error;
		}
		if (error) {
			console.error(error)
			return { status: false, error };
		}
		if (cleanupSession) {
			rpState.state = "";
			rpState.session_id = ""; // invalidate session id
			rpState.response_code = "";
			// await this.rpStateRepository.save(rpState);
			this.rpStateKV.set("rpstate:"+sessionId, JSON.stringify(rpState));
		}
		if (!rpState.claims && presentationClaims) {
			rpState.claims = presentationClaims;
			// await this.rpStateRepository.save(rpState);
			this.rpStateKV.set("rpstate:"+sessionId, JSON.stringify(rpState));
		}
		if (rpState) {
			return {
				status: true,
				rpState: rpState,
				presentationInfo,
				presentations: Array.isArray(vp_token) ? vp_token : typeof vp_token === 'object' ? Object.values(vp_token) : [vp_token]
			};
		}
		const unkownErr = new Error("Uknown error");
		return { status: false, error: unkownErr };

	}
}
