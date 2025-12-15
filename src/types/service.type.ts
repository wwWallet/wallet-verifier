import 'reflect-metadata';

const SERVICE_TYPES = {
	OpenidForPresentationsReceivingService: Symbol.for("OpenidForPresentationsReceivingService"),
	VerifierConfigurationServiceInterface: Symbol.for("VerifierConfigurationServiceInterface"),
	ExpressAppService: Symbol.for("ExpressAppService"),
};

export { SERVICE_TYPES };
