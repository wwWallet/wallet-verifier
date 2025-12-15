import { VerifierConfigurationService } from "../VerifierConfigurationService";
import { OpenidForPresentationsReceivingService } from "../OpenidForPresentationReceivingService";
import { appContainer } from "../inversify.config";


export const openidForPresentationReceivingService = appContainer.resolve(OpenidForPresentationsReceivingService);
export const verifierConfigurationService = appContainer.resolve(VerifierConfigurationService);
