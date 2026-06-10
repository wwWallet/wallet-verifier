// titles.ts
import { config } from ".";

export const siteTitle = config?.siteConfig?.name || "wwWallet Verifier";

export const titles: Record<string, string> = {
	"index": siteTitle,
	"manage-certificates": "Manage Trusted Certificates",
	"public-definitions": "Credential Verification Requests",
	"handle-response-code": "Processing Verification Response",
	"error": "Error",
	"presentation-success": "Credential Verification Results",
	"request-credentials": "Select Credential Claims",
	"request-custom-credential": "Create Custom Credential Request",
	"presentation-request": "Present Credentials",
};

export function titleWithSiteName(titleKey: string): string {
	if (Object.keys(titles).includes(titleKey)) {
		return `${titles[titleKey]} | ${siteTitle}`;
	}
	return siteTitle;
}
