import { Language } from "./Language.type";

declare global {
	namespace Express {
		export interface Request {
			lang: Language;
		}
	}
}
