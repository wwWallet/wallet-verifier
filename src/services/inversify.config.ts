import { Container } from "inversify";
import { OpenidForPresentationsReceivingInterface, VerifierConfigurationInterface } from "./interfaces";
import { SERVICE_TYPES } from "../types/service.type";
import { OpenidForPresentationsReceivingService } from "./OpenidForPresentationReceivingService";
import { ExpressAppService } from "./ExpressAppService";
import { VerifierConfigurationService } from "../services/VerifierConfigurationService"
import 'reflect-metadata';


const appContainer = new Container();

// to add a new configuration, unbind this with appContainer.unbind() if from external component
appContainer.bind<VerifierConfigurationInterface>(SERVICE_TYPES.VerifierConfigurationServiceInterface)
	.to(VerifierConfigurationService);

appContainer.bind<OpenidForPresentationsReceivingInterface>(SERVICE_TYPES.OpenidForPresentationsReceivingService)
	.to(OpenidForPresentationsReceivingService);

appContainer.bind<ExpressAppService>(SERVICE_TYPES.ExpressAppService)
	.to(ExpressAppService);

export { appContainer }
