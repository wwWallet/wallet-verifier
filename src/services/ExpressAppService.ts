import { Application } from 'express';
import { inject, injectable } from 'inversify';
import 'reflect-metadata';
import { SERVICE_TYPES } from '../types/service.type';
import { OpenidForPresentationsReceivingService } from './OpenidForPresentationReceivingService';

@injectable()
export class ExpressAppService {
	constructor(
		@inject(SERVICE_TYPES.OpenidForPresentationsReceivingService) private presentationsReceivingService: OpenidForPresentationsReceivingService,
	) { }

	public async configure(app: Application): Promise<void> {
		app.get('/verification/request-object', async (req, res) => { this.presentationsReceivingService.getSignedRequestObject({ req, res }) });
		app.post('/verification/direct_post', async (req, res) => { this.presentationsReceivingService.responseHandler({ req, res }) });

	}
}
