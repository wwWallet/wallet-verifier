import { Request, Response } from "express";
import { OpenidForPresentationsConfiguration } from "../types/OpenidForPresentationsConfiguration.type";
import { PresentationClaims, RelyingPartyState } from "../entities/RelyingPartyState.entity";

export type PresentationInfo = {
	[descriptor_id: string]: Array<string>;
}

export interface OpenidForPresentationsReceivingInterface {
	getSignedRequestObject(ctx: { req: Request, res: Response }): Promise<any>;
	generateAuthorizationRequestURL(presentationRequest: object, sessionId: string, callbackEndpoint?: string): Promise<{ url: URL; stateId: string }>;
	getPresentationBySessionIdOrPresentationDuringIssuanceSession(sessionId?: string, presentationDuringIssuanceSession?: string, cleanupSession?: boolean): Promise<{ status: true, rpState: RelyingPartyState, presentations: unknown[], presentationInfo: PresentationInfo } | { status: false, error: Error }>;
	getPresentationById(id: string): Promise<{ status: boolean, presentationClaims?: PresentationClaims, presentations?: unknown[] }>;
	responseHandler(ctx: { req: Request, res: Response }): Promise<void>;
}


export interface VerifierConfigurationInterface {
	getConfiguration(): OpenidForPresentationsConfiguration;
	getPresentationRequests(): any[];
}
