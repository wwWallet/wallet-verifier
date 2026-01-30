import { Request, Response } from "express";
import { OpenidForPresentationsConfiguration } from "../types/OpenidForPresentationsConfiguration.type";



export interface OpenidForPresentationsReceivingInterface {
	getSignedRequestObject(ctx: { req: Request, res: Response }): Promise<any>;
	responseHandler(ctx: { req: Request, res: Response }): Promise<void>;
}


export interface VerifierConfigurationInterface {
	getConfiguration(): OpenidForPresentationsConfiguration;
	getPresentationRequests(): any[];
}
