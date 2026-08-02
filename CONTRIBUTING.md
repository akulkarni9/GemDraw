# Contributing to GemDraw

Thanks for your interest in improving GemDraw! This guide covers local setup,
conventions, and the pull-request flow. For a full architecture overview, see the
[root README](README.md).

## Ways to contribute

- Report bugs and request features via [GitHub Issues](../../issues).
- Improve docs, examples, or diagrams.
- Submit code via pull requests (see [Pull requests](#pull-requests)).

## Prerequisites

- **Python 3.13**
- **Node.js 18+** and npm
- **Docker** + Docker Compose (Postgres, and optionally Ollama)
- **Ollama** with a tool-capable model pulled (default `gemma4:26b`)

## Local setup

```bash
git clone <your-fork-url> GemDraw
cd GemDraw

# 1. Env files
cp .env.example .env                 # POSTGRES_*, OLLAMA_* (dev compose)
cp backend/.env.example backend/.env # DATABASE_URL + LLM/OLLAMA settings

# 2. Start Postgres (and Ollama if you don't run it natively)
docker compose up -d postgres        # add `ollama` if you want the container

# 3. Backend
cd backend
python3.13 -m venv .venv313
source .venv313/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8008

# 4. Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to http://localhost:8008.

### Choosing an LLM

The model layer is provider-agnostic via LiteLLM. By default it uses local Ollama
(`OLLAMA_MODEL`). To use another provider, set `LLM_MODEL` (+ `LLM_API_KEY`) in
`backend/.env` — e.g. `LLM_MODEL=openai/gpt-4o`. The model **must support
tool/function calling**. See the [Configuration reference](README.md#configuration-reference).

### Reaching a host Ollama from containers

If you run the backend in a container against a host Ollama, start Ollama bound to
all interfaces (`OLLAMA_HOST=0.0.0.0:11434 ollama serve`) and point
`OLLAMA_BASE_URL` at the correct host address for your runtime (Docker Desktop:
`host.docker.internal`; Rancher Desktop/Lima/Colima: `192.168.5.2`). See the
[Deployment section](README.md#deployment).

## Project layout

See [Project structure](README.md#project-structure). The generation core lives in
[backend/app/services/agent_diagram.py](backend/app/services/agent_diagram.py); the
canvas rendering in [frontend/src/core/tldrawOpsAdapter.ts](frontend/src/core/tldrawOpsAdapter.ts).

## Coding conventions

- **Python**: type-hinted, PEP 8, small focused functions. Match the existing
  style in `app/`. Each ADK drawing tool maps 1:1 to a frontend event — keep that
  contract intact when adding tools (add the matching handler in the adapter).
- **TypeScript/React**: functional components, explicit types, no `any` unless
  unavoidable. Keep drawing-event handling in `core/` and UI in `components/`.
- Keep changes focused; avoid unrelated refactors in the same PR.
- Don't commit secrets. `.env` files are git-ignored — use the `.env.example`
  templates to document new variables.

## Checks before you push

```bash
# Frontend: type-check + build
cd frontend && npm run build

# Backend: byte-compile the app (catches syntax errors)
cd backend && source .venv313/bin/activate && python -m compileall app
```

Please verify a real generation still works end-to-end (submit a prompt and confirm
the diagram renders) when touching the agent pipeline or the ops adapter.

## Pull requests

1. Fork and create a branch: `git checkout -b feat/short-description`.
2. Make your change with clear, incremental commits.
3. Ensure the checks above pass and update docs (`README.md`, `.env.example`) if
   you add or change configuration.
4. Open a PR against `main`, describe **what** and **why**, and link any related
   issue. Fill out the PR template.

## Reporting security issues

Please do **not** open public issues for security problems. See
[SECURITY.md](SECURITY.md).

## Code of conduct

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed under the
project's [Apache License 2.0](LICENSE).
