// titles.ts
import { config } from ".";
import locale from "./locale";

export const siteTitle = config?.siteConfig?.name || "wwWallet Verifier";

export function titleWithSiteName(titleKey: string, currentLocale = "en"): string {
	if((locale as any)[currentLocale].pageTitles[titleKey]) {
		return `${(locale as any)[currentLocale].pageTitles[titleKey]} | ${siteTitle}`;
	}
	return siteTitle;
}
