import { Language } from "./language.type";

declare global {
	namespace Express {
		export interface Request {
			lang: Language;
		}
	}
}
