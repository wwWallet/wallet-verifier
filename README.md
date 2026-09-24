# wwWallet Verifier
wwWallet Verifier is a standalone digital credential verifier implementing OpenID4VP.

> [!NOTE]
> To quickly setup the **wwWallet** ecosystem see https://github.com/wwWallet/wwwallet

## How to run

Install dependencies
```
yarn install
```

Run in dev mode
```
yarn run dev
```

## Configuration

Configuration is loaded from `.env` (see `.env.template`). Values are read via `dotenv` in `config/index.ts`.

The verifier also expects a root CA certificate at `keys/ca.crt`, used as a trusted root for credential verification. It is read at startup and the service fails to start if it is missing.

Environment variables and how they are used:

| Variable | Purpose | Default / Notes |
| --- | --- | --- |
| `SERVICE_URL` | Full external URL of the verifier. | Default: `http://localhost:8005`. Used as the OpenID4VP client base URL, for the `direct_post` response URI and for callback URLs. |
| `SERVICE_PORT` | Port the HTTP server listens on. | Default: `8005`. |
| `APP_SECRET` | Secret used to sign the Express session cookie. | Has an insecure built-in default. Change it outside local development. |
| `WWWALLET_URL` | wwWallet frontend URL that authorization requests are sent to. | Default: `http://localhost:3000/cb`. |
| `DB_HOST` | MySQL/MariaDB host. | Default: `127.0.0.1`. |
| `DB_PORT` | MySQL/MariaDB port. | Default: `3307`. |
| `DB_USERNAME` | Database user. | Default: `root`. |
| `DB_PASSWORD` | Database password. | Default: `root`. |
| `DB_NAME` | Database name. | Default: `verifier`. |
| `PRESENTATION_FLOW_RESPONSE_MODE` | OpenID4VP `response_mode` used in authorization requests. | Default: `direct_post.jwt`. Supported values: `direct_post`, `direct_post.jwt`, `dc_api`, `dc_api.jwt`. |
| `TRUSTED_ISSUERS` | Comma-separated list of credential issuer identifiers whose certificates are added as trusted roots. | Default: `http://localhost:8003/openid`. For each issuer, the verifier fetches `/.well-known/openid-credential-issuer` and, if it has an `mdoc_iacas_uri`, trusts the certificates listed there (relevant for mso_mdoc). |
| `CLOCK_TOLERANCE` | Allowed clock skew (seconds) when validating credential and presentation timestamps. | Default: `60`. |
| `SESSION_ID_COOKIE_MAX_AGE` | Max age (milliseconds) of the `session_id` cookie. | Default: `900000` (15 minutes). |
| `SESSION_ID_COOKIE_SECURE` | Set the `Secure` flag on the `session_id` cookie. | Default: `false`. Only the exact value `true` enables it. Set it when served over HTTPS. |
| `SITE_NAME` | Web app manifest `name`. | Default: `wwWallet Verifier`. |
| `SITE_SHORT_NAME` | Web app manifest `short_name`. | Default: `wwWallet Verifier`. |
| `SITE_THEME_COLOR` | Web app manifest `theme_color`. | Default: `#4d7e3e`. Quote hex values in `.env` (`"#4d7e3e"`), otherwise `#` starts a comment. |
| `SITE_BACKGROUND_COLOR` | Web app manifest `background_color`. | Default: `#4d7e3e`. Quote hex values in `.env` (`"#4d7e3e"`), otherwise `#` starts a comment. |

## Pre-commit

We use [pre-commit](https://pre-commit.com/) to enforce our `.editorconfig` (newline at EOF, no bad indentation, etc.) before code is committed.

#### One-time setup

```
# install pre-commit if you don’t already have it
pip install pre-commit       # or brew install pre-commit / pipx install pre-commit

# enable the git hook in this repo
pre-commit install

# optional: clean up the repo on demand
pre-commit run --all-files
git add -A
```

#### What happens on commit

- Auto-fixers run (e.g. add final newlines).
- After the auto-fixers, the editorconfig-checker runs inside Docker to validate all staged files.
- If violations remain, fix them manually until the commit passes.
