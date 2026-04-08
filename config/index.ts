import fs from "node:fs";
import path from "node:path";
import dotenv from 'dotenv';
dotenv.config();

const ROOT_CA_PATH = path.resolve(process.cwd(), "./keys/ca.crt");
const rootCa = fs.readFileSync(ROOT_CA_PATH, "utf8");

export const config = {
	url: String(process.env.SERVICE_URL || "http://localhost:8005"),
	port: parseInt(process.env.SERVICE_PORT || "8005"),
	appSecret: String(process.env.APP_SECRET || "dsfkwfkwfwdfdsfSaSe2e34r4frwr42rAFdsf2lfmfsmklfwmer"),
	db: {
		host: String(process.env.DB_HOST || "127.0.0.1"),
		port: String(process.env.DB_PORT || "3307"),
		username: String(process.env.DB_USERNAME || "root"),
		password: String(process.env.DB_PASSWORD || "root"),
		dbname: String(process.env.DB_NAME || "verifier"),
	},
	presentationFlow: {
		response_mode: String(process.env.PRESENTATION_FLOW_RESPONSE_MODE || "direct_post.jwt"),
	},
	wwwalletURL: process.env.WWWALLET_URL || "http://localhost:3000/cb",
	trustedRootCertificates: [rootCa],
	trustedIssuers: process.env.TRUSTED_ISSUERS
		? process.env.TRUSTED_ISSUERS.split(',')
		: ["http://localhost:8003/openid"],
	sessionIdCookieConfiguration: {
		maxAge: parseInt(process.env.SESSION_ID_COOKIE_MAX_AGE || "900000", 10),
		secure: process.env.SESSION_ID_COOKIE_SECURE === 'true' ? true : false,
	},
	clockTolerance: parseInt(process.env.CLOCK_TOLERANCE || "60", 10),
	siteConfig: {
		name: process.env.SITE_NAME || "wwWallet Verifier",
		short_name: process.env.SITE_SHORT_NAME || "wwWallet Verifier",
		theme_color: process.env.SITE_THEME_COLOR || "#4d7e3e",
		background_color: process.env.SITE_BACKGROUND_COLOR || "#4d7e3e",
	},
};
