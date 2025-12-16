import { Application } from 'express';
import { OpenidForPresentationsReceivingService } from './OpenidForPresentationReceivingService';

export class ExpressAppService {
	constructor(
		private presentationsReceivingService: OpenidForPresentationsReceivingService,
	) { }

	public async configure(app: Application): Promise<void> {
		app.get('/verification/request-object', async (req, res) => { this.presentationsReceivingService.getSignedRequestObject({ req, res }) });
		app.post('/verification/direct_post', async (req, res) => { this.presentationsReceivingService.responseHandler({ req, res }) });

	}
}
