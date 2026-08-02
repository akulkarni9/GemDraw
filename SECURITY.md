# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in GemDraw, please report it
**privately** — do not open a public GitHub issue.

- **Email:** ajaykulkarni178@gmail.com
- Please include a description, reproduction steps, affected component
  (backend/frontend/deployment), and impact.
- You'll receive an acknowledgement as soon as possible, and we'll work with you
  on a fix and coordinated disclosure.

Please give us a reasonable time to address the issue before any public
disclosure.

## Supported versions

GemDraw is an early-stage project; security fixes are applied to the `main`
branch. There is no long-term-support release line yet.

## Scope & hardening notes

GemDraw runs LLM inference and a web app. When deploying, keep these in mind:

- **API keys / secrets** live in environment variables (`LLM_API_KEY`,
  `DATABASE_URL`, etc.). Never commit them; `.env` files are git-ignored.
- **CORS** allows localhost/127.0.0.1 by default; add production origins via
  `CORS_ORIGINS`. Do not use a wildcard in production.
- **Ollama binding.** Binding Ollama to `0.0.0.0` exposes it to your network.
  Only do this on trusted networks or behind a firewall.
- **Database.** Use strong Postgres credentials and do not expose port 5432
  publicly.
- **Reverse proxy / TLS.** Terminate HTTPS at your proxy (e.g. Coolify) and don't
  expose the backend directly.

Reports about issues in third-party dependencies (tldraw, FastAPI, Google ADK,
etc.) should generally go to those upstream projects, but feel free to flag them
to us if they affect GemDraw directly.
