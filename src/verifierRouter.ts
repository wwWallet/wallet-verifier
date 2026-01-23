import { Router } from "express";
import * as qrcode from 'qrcode';
import { config } from "./../config";
import { OpenidForPresentationsReceivingService } from "./services/OpenidForPresentationReceivingService";
import { VerifierConfigurationService } from "./services/VerifierConfigurationService";
import { generateRandomIdentifier } from "./util/generateRandomIdentifier";
import { addSessionIdCookieToResponse } from "../config/sessionIdCookieConfig";
import { initializeCredentialEngine } from "./util/initializeCredentialEngine";

import Ajv from 'ajv';
const ajv = new Ajv();

const dcqlQuerySchema = {
	type: "object",
	required: ["credentials"],
	properties: {
		credentials: {
			type: "array",
			items: {
				type: "object",
				required: ["id", "format"],
				properties: {
					id: { type: "string" },
					format: { type: "string" },
					meta: {
						type: "object",
						properties: {
							doctype_value: { type: "string" },
							"sd-jwt_alg_values": {
								type: "array",
								items: { type: "string" }
							},
							"kb-jwt_alg_values": {
								type: "array",
								items: { type: "string" }
							}
						},
						additionalProperties: true
					},
					claims: {
						type: "array",
						items: {
							type: "object",
							required: ["path"],
							properties: {
								id: { type: "string" },
								path: {
									type: "array",
									items: { type: "string" }
								},
								intent_to_retain: { type: "boolean" },
								filter: { type: "object" }
							}
						}
					}
				}
			}
		},
		credential_sets: {
			type: "array",
			items: {
				type: "object",
				required: ["options", "purpose"],
				properties: {
					options: {
						type: "array",
						items: {
							type: "array",
							items: { type: "string" }
						}
					},
					purpose: { type: "string" }
				}
			}
		}
	}
};

export const sanitizeInput = (input: string): string =>
	input.replace(/[^\x20-\x7E\n]/g, '');


const MAX_CERT_LENGTH = 5000;

const verifierRouter = Router();
const verifierConfiguration = new VerifierConfigurationService();
const openidForPresentationReceivingService = new OpenidForPresentationsReceivingService(verifierConfiguration);

verifierRouter.post('/public/manage-certificates', async (req, res) => {
	const { certificate } = req.body;
	try {
		if (!certificate) {
			throw new Error("No certificate provided");
		}
		if (certificate.length > MAX_CERT_LENGTH) {
			throw new Error("Certificate too large");
		}
		if (!/^([A-Za-z0-9+/=\s-]+)$/.test(certificate)) {
			throw new Error("Invalid characters in certificate input");
		}
		const sanitizedCert = sanitizeInput(certificate);
		const pem = sanitizedCert.includes('-----BEGIN CERTIFICATE-----')
			? sanitizedCert
			: `-----BEGIN CERTIFICATE-----\n${sanitizedCert.trim()}\n-----END CERTIFICATE-----`;

		const normalizedPem = pem.replace(/\r\n/g, '\n');
		(config.trustedRootCertificates as string[]).push(normalizedPem.trim());
		res.redirect('/verifier/public/manage-certificates');
	} catch (error) {
		res.render('manage-certificates.pug', {
			trustedRootCertificates: config.trustedRootCertificates,
			error: {
				errorMessage: 'error adding x509 certificate'
			}
		});
	}
});

verifierRouter.get('/public/manage-certificates', async (_req, res) => {
	return res.render('manage-certificates.pug',{
		trustedRootCertificates: config.trustedRootCertificates
	});
})

verifierRouter.get('/public/definitions', async (_req, res) => {
	return res.render('public-definitions.pug', {
		presentationRequests: verifierConfiguration.getPresentationRequests(),
	});
})


verifierRouter.get('/callback/status', async (req, res) => { // response with the status of the presentation (this endpoint should be protected)
	if (!req.cookies['session_id']) {
		return res.send({ status: false, error: "Missing session_id from cookies" });
	}
	const result = await openidForPresentationReceivingService.openid4vp.getPresentationBySessionId(req.cookies['session_id'], false);
	if (!result.status) {
		return res.send({ status: false, error: "Presentation not received" });
	}
	return res.send({ status: result.status, presentationClaims: result.rpState.claims, presentation: result.rpState.vp_token });
})


verifierRouter.get('/callback', async (_req, res) => {
	res.render('handle-response-code');
})

verifierRouter.post('/callback', async (req, res) => {
	// this request includes the response code
	let session_id = req.cookies['session_id'];
	if (req.body.response_code) { // response_code is considered more stable than session_id
		const s = await openidForPresentationReceivingService.openid4vp.getRPStateByResponseCode(req.body.response_code);
		if (s) {
			session_id = s.session_id;
		}
	}

	if (!session_id) {
		console.error("Problem with the verification flow")
		return res.status(400).send({ error: "Problem with the verification flow" })
	}

	const result = await openidForPresentationReceivingService.openid4vp.getPresentationBySessionId(session_id, true);

	if (result.status == false ||
		result.rpState.vp_token == null ||
		result.rpState.claims == null ||
		result.rpState.date_created == null) {
		return res.render('error.pug', {
			msg: result.status == false ? result.error.message : "Unknown error",
			code: 0,
		});
	}

	const { claims, date_created } = result.rpState;
	const presentations = result.presentations;
	const status = result.status;

	const credentialImages = [];
	const credentialPayloads = [];
	for (const p of presentations) {
		const { credentialParsingEngine } = await initializeCredentialEngine();
		const result = await credentialParsingEngine.parse({ rawCredential: p });
		if (result.success) {
			let imageUri = undefined;
			try {
				const dataUriFn = result.value.metadata.credential.image?.dataUri;
				imageUri = dataUriFn ? await dataUriFn() : undefined;
			} catch (err) {
				console.warn('Failed to load credential image:', err);
			}
			credentialImages.push(imageUri);
			credentialPayloads.push(result.value.signedClaims);
		}
	}

	console.log("Presentation messages: ", result.presentationInfo);
	return res.render('success.pug', {
		status: status,
		verificationTimestamp: new Date(date_created).toISOString(),
		presentationClaims: claims,
		credentialPayloads: credentialPayloads,
		presentationInfo: result.presentationInfo,
		credentialImages: credentialImages,
	});
})

verifierRouter.use('/public/definitions/configurable-presentation-request/:presentation_request_id', async (req, res) => {
	const presentation_request_id = req.params.presentation_request_id;
	if (!presentation_request_id) {
		return res.render('error', {
			msg: "No presentation request was selected",
			code: 0,
		});
	}
	const presentationRequest = verifierConfiguration.getPresentationRequests().filter(pd => pd.id == presentation_request_id)[0];
	if (!presentationRequest) {
		return res.render('error', {
			msg: "No presentation request was found",
			code: 0,
		});
	}
	const selectableFields = presentationRequest.dcql_query.credentials
		.flatMap((credential: any) => credential.claims)
		.map((claim: any) => {
			const label = claim.path.join(".");
			return [label, claim.path[0]];
		});
	return res.render('configurable-presentation', {
		presentationRequestId: presentationRequest.id,
		dcqlQuery: presentationRequest.dcql_query,
		selectableFields,
	});
})

verifierRouter.get('/public/definitions/edit-dcql-query', async (_req, res) => {
	return res.render('edit-dcql-query', {
		schema: dcqlQuerySchema
	});
})

verifierRouter.post('/public/definitions/edit-dcql-query', async (req, res) => {
	if (req.method === "POST" && req.body.action && req.cookies.session_id) {
		// update is_cross_device --> false since the button was pressed
		const rpState = await openidForPresentationReceivingService.openid4vp.getRPStateBySessionId(req.cookies.session_id);
		if (rpState) {
			rpState.is_cross_device = false;
			openidForPresentationReceivingService.openid4vp.saveRPState(rpState.session_id, rpState);
		}
		return res.redirect(req.body.action);
	}
	let query;
	let presentationRequest = {}
	try {
		query = JSON.parse(req.body.dcqlQuery);
		const validate = ajv.compile(dcqlQuerySchema);
		if (!validate(query)) {
			return res.render('error.pug', {
				msg: "Invalid DCQL query format",
				code: 0,
			});
		}
		presentationRequest = {
			id: "EditableDcqlQuery",
			title: "Editable DCQL Query",
			dcql_query: query
		}
	} catch (error) {
		return res.render('error.pug', {
			msg: "Error while parsing the DCQL query",
			code: 0,
		});
	}
	const scheme = req.body.scheme

	const newSessionId = generateRandomIdentifier(12);
	addSessionIdCookieToResponse(res, newSessionId);
	const { url } = await openidForPresentationReceivingService.generateAuthorizationRequestURL(presentationRequest, newSessionId, config.url + "/verifier/callback");
	const modifiedUrl = url.toString().replace("openid4vp://cb", scheme)
	let authorizationRequestQR = await new Promise((resolve) => {
		qrcode.toDataURL(modifiedUrl.toString(), {
			margin: 1,
			errorCorrectionLevel: 'L',
			type: 'image/png'
		},
			(err, data) => {
				if (err) return resolve("NO_QR");
				return resolve(data);
			});
	}) as string;

	return res.render('QR.pug', {
		wwwalletURL: config.wwwalletURL,
		authorizationRequestURL: modifiedUrl,
		authorizationRequestQR,
		presentationRequest: JSON.stringify(JSON.parse(req.body.dcqlQuery)),
		state: url.searchParams.get('state'),
	});
})

verifierRouter.get('/public/definitions/presentation-request/status/:presentation_request_id', async (req, res) => {
	console.log("session_id : ", req.cookies['session_id'])
	if (req.cookies['session_id'] && req.method == "GET") {
		const { status } = await openidForPresentationReceivingService.openid4vp.getPresentationBySessionId(req.cookies['session_id'], false);
		if (status == true) {
			return res.send({ url: `/verifier/callback` });
		}
		else {
			return res.send({});
		}
	}
	else {
		return res.send({})
	}
})

verifierRouter.use('/public/definitions/presentation-request/:presentation_request_id', async (req, res) => {
	const presentation_request_id = req.params.presentation_request_id;
	if (!presentation_request_id) {
		return res.render('error', {
			msg: "No presentation request was selected",
			code: 0,
		});
	}


	let presentationRequest;
	if (req.method === "POST" && req.body.dcql_query) {
		// Use the filtered query
		presentationRequest = { dcql_query: JSON.parse(req.body.dcql_query) };
	} else {
		presentationRequest = JSON.parse(JSON.stringify(verifierConfiguration.getPresentationRequests().filter(pd => pd.id == presentation_request_id)[0])) as any;
	}
	if (!presentationRequest) {
		return res.render('error', {
			msg: "No presentation request was found",
			code: 0,
		});
	}

	let scheme = "openid4vp://cb";
	if (req.method === "POST" && req.body.scheme) {
		scheme = req.body.scheme;
	}

	if (req.method === "POST" && req.body.action && req.cookies.session_id) { // handle click of "open with..." button
		console.log("Cookie = ", req.cookies)
		// update is_cross_device --> false since the button was pressed
		const rpState = await openidForPresentationReceivingService.openid4vp.getRPStateBySessionId(req.cookies.session_id);
		if (rpState) {
			rpState.is_cross_device = false;
			openidForPresentationReceivingService.openid4vp.saveRPState(rpState.session_id, rpState);
		}
		return res.redirect(req.body.action);
	}
	const newSessionId = generateRandomIdentifier(12);
	addSessionIdCookieToResponse(res, newSessionId); // start session here
	const { url } = await openidForPresentationReceivingService.generateAuthorizationRequestURL(presentationRequest, newSessionId, config.url + "/verifier/callback");
	const modifiedUrl = url.toString().replace("openid4vp://cb", scheme)
	let authorizationRequestQR = await new Promise((resolve) => {
		qrcode.toDataURL(modifiedUrl.toString(), {
			margin: 1,
			errorCorrectionLevel: 'L',
			type: 'image/png'
		},
			(err, data) => {
				if (err) return resolve("NO_QR");
				return resolve(data);
			});
	}) as string;

	return res.render('QR.pug', {
		wwwalletURL: config.wwwalletURL,
		authorizationRequestURL: modifiedUrl,
		authorizationRequestQR,
		presentationRequest: JSON.stringify(presentationRequest.dcql_query),
		state: url.searchParams.get('state'),
	});
})

export { verifierRouter };
