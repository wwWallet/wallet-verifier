import { config } from "./index.js";

const locale = {
	en: {
		definitions: {
			title: "Present your Verifiable Credentials",
			subtitle: "Choose a predefined request or create a custom one",
			customRequestTitle: "Custom Request",
			customRequestDescription: "Import the DCQL query of your choice",
		},
		requestCredentials: {
			title: "Configure your Presentation Request",
			subtitle: "Choose format and fields, then request a QR",
			format: {
				label: "Select Format",
				sdjwt: "SD-JWT",
				mdoc: "mDoc",
			},
			attributes: {
				label: "Select Attributes",
				all: "Select all",
				none: "Select none",
			},
			schema: {
				label: "Edit Schema",
				hint: "Keep the default unless you need a custom scheme",
				default: "openid4vp://cb",
			}
		},
		customRequestCredential: {
			title: "Edit Request",
			subtitle: "Edit scheme and DCQL query, then submit",
			scheme: {
				label: "Edit Schema",
				default: "openid4vp://cb",
			},
			dcqlQuery: {
				label: "DCQL Query",
				hint: "You can edit this template as needed",
			}

		},
		presentationRequest: {
			title: "Present your Credentials",
			subtitle: "Scan or open the request in your wallet",
			buttons: {
				OpenWithwwwallet: "Open with wwWallet",
				OpenWithNativeWallet: "Open with a native wallet",
			}
		},
		presentationSuccess: {
			loading: {
				title: "Verifying Presentation...",
				subtitle: "Please wait while we verify your credentials.",
			},
			title: "Presentation Successful",
			verifiedOn: "Verified on",
			claims: {
				title: "Requested claims extracted from credentials",
				name: "Name",
				value: "Value",
				additionalInfoTitle: "Additional Info",
			},
			json: {
				title: "Credentials (raw JSON)",
				copy: "Copy",
				copied: "Copied",
			},
		},
		requestCredential: "Request Credentials",
		error: {
			title: "An error occurred",
			return: "Return",
		},
		header: {
			title: "", // set to empty if you don't want text next to logo
			home: "Home",
			requestCredentials: "Request Credentials",
			manageCertificates: "Manage Certificates",
		},
		footer: {
			services: "Services",
			documentation: "Documentation",
			adminLogin: "Verifier Panel",
			contact: "Contact",
		},
		index: {
			verifyCredential: "Request Credentials",
			heading: config.siteConfig.name,
			oid4vpProfile: "OpenID4VP Interoperability Profile",
			openid4vp: [
				["OIDVP Specification", "Draft 24"],
				["Response Mode", "direct_post.jwt [OpenID4VP]"],
				["Request Method", "request_uri signed [JAR]"],
				["Client ID Scheme", "x509_san_dns"],
				["Credential Format", "dc+sd-jwt, mso_mdoc"],
			],
			paragraph: "This website is a proof-of-concept service designed to perform verifications of Verifiable Credentials (VCs) in SD-JWT or mDoc formats, supporting the wwWallet ecosystem. It conducts only sample verifications to showcase credential checks (not valid for real-world use).",
		},
		manageCertificates: {
			title: "Manage Certificates",
			subtitle: "View trusted root certificates and add new ones",
			addCertificateLabel: "Add X.509 Certificate (PEM or Base64)",
			certificatePlaceholder: "-----BEGIN CERTIFICATE----- ...",
			certificateHint: "Paste the full PEM block or Base64 content",
			addButton: "Add X.509 Certificate",
			trustedRootsTitle: "Trusted Root Certificates",
			noCertificates: "No trusted root certificates found.",
			pemSummary: "X.509 Certificate PEM",
			base64Summary: "X.509 Certificate Base64",
		},
	}
}

export default locale;
