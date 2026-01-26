import { Request, Response } from "express";
import { OpenidForPresentationsConfiguration } from "../types/OpenidForPresentationsConfiguration.type";
import { RPState } from "../types/RPState";

export type PresentationInfo = {
	[descriptor_id: string]: Array<string>;
}

export interface OpenidForPresentationsReceivingInterface {
	getSignedRequestObject(ctx: { req: Request, res: Response }): Promise<any>;
	generateAuthorizationRequestURL(presentationRequest: object, sessionId: string, callbackEndpoint?: string): Promise<{ url: URL; stateId: string }>;
	getPresentationBySessionId(sessionId?: string, cleanupSession?: boolean): Promise<{ status: true, rpState: RPState, presentations: unknown[], presentationInfo: PresentationInfo } | { status: false, error: Error }>;
	responseHandler(ctx: { req: Request, res: Response }): Promise<void>;
}


export interface VerifierConfigurationInterface {
	getConfiguration(): OpenidForPresentationsConfiguration;
	getPresentationRequests(): any[];
}
