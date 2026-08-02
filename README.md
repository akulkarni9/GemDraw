# GemDraw

> AI-native architecture diagramming. Describe a system in plain English and watch it draw itself — high-level architecture (HLD) that you can drill into for detailed UML class diagrams (LLD) — powered by a **local Gemma 4 26B** model orchestrated through **Google ADK** multi-agent pipelines, rendered live on a [tldraw](https://tldraw.dev) canvas.

Everything runs on your own machine. No cloud LLM, no API keys.

---

## Table of contents

- [What it does](#what-it-does)
- [How it works](#how-it-works)
  - [The agentic core (Google ADK + Gemma 4 26B)](#the-agentic-core-google-adk--gemma-4-26b)
  - [How Google ADK helps Gemma 4 26B](#how-google-adk-helps-gemma-4-26b)
  - [Tools = drawing commands](#tools--drawing-commands)
  - [End-to-end request flow](#end-to-end-request-flow)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
  - [1. Clone & configure](#1-clone--configure)
  - [2. Start Postgres & Ollama](#2-start-postgres--ollama)
  - [3. Pull the model](#3-pull-the-model)
  - [4. Backend](#4-backend)
  - [5. Frontend](#5-frontend)
- [Configuration reference](#configuration-reference)
- [API reference](#api-reference)
- [Usage](#usage)
- [Performance & tuning](#performance--tuning)
- [Troubleshooting](#troubleshooting)
- [Design notes & caveats](#design-notes--caveats)

---

## What it does

- **Prompt → architecture.** Type "a URL shortener with a gateway, service, Redis cache and Postgres" and GemDraw generates a labelled, connected HLD diagram.
- **Drill-down.** Double-click any component to open a child diagram and auto-generate a **UML class diagram (LLD)** for just that component.
- **Refine.** Send follow-up prompts to edit an existing diagram; ids are reused so changes are incremental.
- **Live rendering.** Drawing commands stream over Server-Sent Events and appear on the canvas as the model produces them.
- **Persistence.** Diagrams, their parent/child relationships, and prompt history are saved in Postgres.

---

## How it works

### The agentic core (Google ADK + Gemma 4 26B)

Diagram generation is a **multi-agent builder→critic pipeline** built with [Google ADK](https://google.github.io/adk-docs/), running entirely against a local Gemma model via [LiteLLM](https://docs.litellm.ai/) → [Ollama](https://ollama.com/).

```mermaid
flowchart LR
    U[User prompt] --> R[run_agent_stream]
    R --> B[Builder LlmAgent<br/>+ BuiltInPlanner]
    B -->|tool calls| T[Drawing tools]
    B --> C[Critic LlmAgent]
    C -->|corrective tool calls| T
    T -->|_record| OP[(per-request ops list)]
    OP -->|drained live| SSE[SSE stream] --> FE[tldraw canvas]
    B -. LiteLlm .-> O[Ollama · gemma4:26b]
    C -. LiteLlm .-> O
```

- **`LlmAgent` × 4** — `hld_builder`, `hld_critic`, `lld_builder`, `lld_critic`. The builder constructs the diagram; the critic reviews the builder's tool-call history on the **same ADK session** and emits corrective calls (connect orphan nodes, add missing relations, fix overlaps).
- **`BuiltInPlanner`** — attached to both builders so Gemma *reasons about the full component/class list before drawing*, improving completeness. Thoughts are suppressed so they never leak into the drawing stream.
- **`LiteLlm(ollama_chat/gemma4:26b)`** — routes every agent to the local model, using its native tool-calling and thinking capabilities. Configured `num_ctx` and `num_predict` are forwarded to Ollama.
- **`Runner` + `InMemorySessionService`** — drive each agent turn; sessions are created per request and deleted afterwards.

### How Google ADK helps Gemma 4 26B

A local 26B model is capable but, on its own, unreliable at producing large, valid, structured output. ADK is the scaffolding that turns Gemma's raw capability into dependable diagrams:

| Gemma 4 26B on its own | What ADK adds | Result |
|------------------------|---------------|--------|
| Can emit tool calls, but often drifts to prose or malformed JSON | **Typed tool schemas** auto-generated from each Python function — the model is constrained to a valid, named-argument contract | No more parsing hacks or dropped edges; output is correct at the source |
| Tends to "dump" an answer before fully reasoning | **`BuiltInPlanner`** makes Gemma *think through the full component/class list first*, then draw | More complete diagrams (every service wired to its datastore, richer class members) |
| Single pass = whatever it produced is final | **Builder→critic multi-agent loop** on a shared session lets a second agent review and repair the first agent's work | Self-correction: orphan nodes get connected, missing relations added |
| No lifecycle, memory, or turn management | **`Runner` + `InMemorySessionService`** manage sessions, turns, and shared history per request | Clean orchestration; the critic literally sees the builder's tool-call history |
| Native `thinking` + tool-calling exist but are awkward to drive | **`LiteLlm(ollama_chat/…)`** adapter routes ADK to local Gemma and forwards `num_ctx` / `num_predict` / thinking config | Gemma's full context window and reasoning are actually exercised |
| Occasionally returns nothing | Pipeline-level **empty-diagram retry + error op** | The user always gets a diagram or a clear message, never a silent blank canvas |

In short: **Gemma provides the architectural reasoning; ADK provides the structure, self-correction, and reliability that make that reasoning usable.** Remove ADK and you lose the typed contract, the planner, and the critic — the exact things that keep a local model's output correct and complete.

### Tools = drawing commands

The key design idea: **each ADK tool maps 1:1 to a frontend drawing event.** ADK auto-generates a typed JSON schema from each Python function's signature and docstring, so the model is *forced* to emit valid, structured calls instead of hand-written JSON — this eliminates the malformed-output/dropped-edge failure mode.

| Tool | Emitted event | Purpose |
|------|---------------|---------|
| `create_node` | `CREATE_NODE` | Architecture node (service, database, cache, queue, load_balancer, client) |
| `connect_nodes` | `CONNECT_NODES` | Directed edge between nodes |
| `group_nodes` | `GROUP_NODES` | Labelled frame around related nodes |
| `modify_node` / `delete_node` | `MODIFY_NODE` / `DELETE_NODE` | Edit / remove |
| `create_class` | `CREATE_CLASS` | UML class box |
| `add_field` / `add_method` | `ADD_FIELD` / `ADD_METHOD` | Class members |
| `create_relation` | `CREATE_RELATION` | UML relationship (dependency, composition, aggregation, inheritance, association) |

Every tool call is appended to a per-request collector (a `ContextVar`), which the FastAPI route drains and streams to the client as it fires.

### End-to-end request flow

1. Frontend `POST /api/generate` with the prompt, `detail_level`, and current canvas state.
2. `run_agent_stream` runs the **builder** (retrying once if it produced nothing), then the **critic** on the shared session.
3. Each tool call becomes an SSE line: `data: {"event": "CREATE_NODE", ...}\n\n`.
4. The tldraw adapter applies each op to the canvas in real time.
5. A final `DIAGRAM_ID` event is sent; a background task reduces the ops into canvas state and persists it to Postgres.

---

## Tech stack

**Backend**
- FastAPI + Uvicorn (async, SSE streaming)
- Google ADK (agents, planner, runner, sessions)
- LiteLLM → Ollama (local Gemma 4 26B)
- SQLAlchemy (async) + asyncpg → PostgreSQL 16
- Pydantic v2

**Frontend**
- React + TypeScript
- tldraw v2 (canvas + custom shapes)
- Vite (dev server + proxy)

**Infra**
- Docker Compose (dev: Postgres + Ollama)
- Production stack (`docker-compose.prod.yml`): containerized backend + nginx-served frontend + Postgres, with Ollama running natively on the host GPU. Deployable to [Coolify](https://coolify.io/) or any Docker host.

---

## Project structure

```
GemDraw/
├── docker-compose.yml        # DEV: Postgres + Ollama services
├── docker-compose.prod.yml   # PROD: backend + frontend + Postgres (Ollama on host)
├── .env / .env.example       # docker-compose secrets (POSTGRES_*), OLLAMA_*
├── .env.prod.example         # production stack env template
├── backend/
│   ├── requirements.txt
│   ├── Dockerfile            # production backend image
│   ├── .env / .env.example   # DATABASE_URL, OLLAMA_* settings
│   └── app/
│       ├── main.py           # FastAPI app, lifespan migrations, CORS, log config
│       ├── config.py         # Settings (model, ctx, temperature, cors_origins…)
│       ├── routes/
│       │   ├── generate.py   # /generate SSE endpoint + canvas reduction/persistence
│       │   └── diagrams.py   # CRUD + drilldown
│       ├── services/
│       │   └── agent_diagram.py   # ★ ADK agents, tools, builder→critic pipeline
│       ├── models/
│       │   ├── schemas.py    # API request/response models
│       │   └── events.py     # DrawingEvent union (used by persistence/reduction)
│       └── db/
│           ├── database.py   # async engine/session
│           └── models.py     # Diagram, SessionEntry tables
└── frontend/
    ├── Dockerfile            # multi-stage build → nginx
    ├── nginx.conf            # SPA + SSE-safe /api proxy
    └── src/
        ├── main.tsx
        ├── components/       # App, CanvasEngine, PromptBar, DiagramSidebar, Breadcrumb
        └── core/             # stream orchestration + tldraw ops adapter
```

---

## Prerequisites

- **Python 3.13** (a virtualenv at `backend/.venv313` is referenced in dev)
- **Node.js 18+** and npm
- **Docker** + Docker Compose (for Postgres and, optionally, Ollama)
- **Ollama** — either the Docker service below or a native install from [ollama.com](https://ollama.com/)
- Enough RAM/VRAM to run a 26B model (see [Performance & tuning](#performance--tuning))

---

## Setup

### 1. Clone & configure

```bash
git clone <your-repo-url> GemDraw
cd GemDraw

# docker-compose secrets (Postgres + Ollama)
cp .env.example .env
#   edit POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB

# backend settings
cp backend/.env.example backend/.env
#   set DATABASE_URL to match the Postgres creds above, e.g.
#   DATABASE_URL=postgresql+asyncpg://gemdraw:gemdraw@localhost:5432/gemdraw
```

### 2. Start Postgres & Ollama

```bash
docker compose up -d
```

This starts:
- **Postgres 16** on `localhost:5432`
- **Ollama** on `localhost:11434` (GPU-enabled via NVIDIA in the compose file)

> On macOS/Apple Silicon, GPU passthrough to the Ollama container is not available. Prefer a **native Ollama install** (`brew install ollama` / the app) and start only Postgres from compose (`docker compose up -d postgres`).

### 3. Pull the model

```bash
ollama pull gemma4:26b
# verify it exposes tools + thinking:
ollama show gemma4:26b
```

### 4. Backend

```bash
cd backend
python3.13 -m venv .venv313
source .venv313/bin/activate
pip install -r requirements.txt

# run the API (creates tables + runs idempotent migrations on startup)
python -m uvicorn app.main:app --reload --port 8008
```

API is now at `http://localhost:8008` (OpenAPI docs at `/docs`).

### 5. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` to `http://localhost:8008`.

---

## Configuration reference

Backend settings live in `backend/.env` (loaded by `app/config.py`, all env-overridable):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | *(required)* | `postgresql+asyncpg://user:pass@host:5432/db` |
| `LLM_MODEL` | *(unset)* | Full LiteLLM model id for **any** provider, e.g. `openai/gpt-4o`, `anthropic/claude-3-5-sonnet-latest`, `gemini/gemini-2.0-flash`, `ollama_chat/qwen2.5:14b`. If unset, falls back to `ollama_chat/{OLLAMA_MODEL}`. Model **must support tool calling** |
| `LLM_API_KEY` | *(unset)* | API key for hosted providers (not needed for Ollama) |
| `LLM_API_BASE` | *(unset)* | Optional endpoint override (e.g. an OpenAI-compatible server) |
| `LLM_TEMPERATURE` | `0.2` | Sampling temperature (used when `LLM_MODEL` is set) |
| `LLM_MAX_OUTPUT_TOKENS` | `0` | Max output tokens for non-Ollama providers (0 = fall back to `OLLAMA_NUM_PREDICT`) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | `gemma4:26b` | Ollama model tag (used as `ollama_chat/<model>` when `LLM_MODEL` is unset) |
| `OLLAMA_TEMPERATURE` | `0.2` | Lower = more deterministic layouts |
| `OLLAMA_NUM_PREDICT` | `16384` | Max generation tokens (forwarded to Ollama) |
| `OLLAMA_NUM_CTX` | `131072` | Context window (forwarded to Ollama) |
| `CORS_ORIGINS` | `""` | Comma-separated extra browser origins allowed by CORS (localhost/127.0.0.1 on any port are always allowed) |

> **Switching providers is env-only.** The model layer is provider-agnostic via
> LiteLLM — set `LLM_MODEL` (+ `LLM_API_KEY`) and the whole ADK builder→critic
> pipeline runs against that model, no code changes. The only hard requirement is
> **tool/function-calling support**.

---

## Deployment

The repo ships a production stack in `docker-compose.prod.yml` that builds the
backend and the nginx-served frontend and runs Postgres alongside them. **Ollama
is not containerized** — a 26B model needs GPU access, so it runs **natively on
the host** (e.g. Ollama.app / `ollama serve` on an Apple Silicon Mac using Metal).
The backend reaches it over the network via `OLLAMA_BASE_URL`.

```bash
cp .env.prod.example .env.prod        # set POSTGRES_*, OLLAMA_BASE_URL, CORS_ORIGINS
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

The frontend container listens on port 80 (map it to your domain via a reverse
proxy such as Coolify's). nginx serves the SPA and proxies `/api` to the backend
with SSE-safe settings (`proxy_buffering off`, long read timeouts).

### Reaching the host's Ollama from containers

This is the one part that is environment-specific. Two things must be true:

1. **Ollama must bind all interfaces**, not just loopback. Start it with:
   ```bash
   OLLAMA_HOST=0.0.0.0:11434 ollama serve
   ```
   > If the Ollama menu-bar app is running it binds `127.0.0.1` only and will
   > block a proper `0.0.0.0` bind — quit it before starting the serve above.

2. **`OLLAMA_BASE_URL` must point at the host address your container runtime
   exposes**, which differs by runtime:

   | Docker runtime | Host address for `OLLAMA_BASE_URL` |
   |----------------|-------------------------------------|
   | Docker Desktop (macOS/Windows) | `http://host.docker.internal:11434` |
   | Rancher Desktop / Lima | `http://192.168.5.2:11434` (the VM's host gateway) |
   | Colima | `http://192.168.5.2:11434` (usually the same) |
   | Separate machine on your LAN | `http://<that-machine-ip>:11434` |

   Verify from inside the backend container:
   ```bash
   docker compose -f docker-compose.prod.yml exec backend \
     python -c "import os,httpx;print(httpx.get(os.environ['OLLAMA_BASE_URL']+'/api/tags').status_code)"
   # expect: 200
   ```

### Coolify

Deploy `docker-compose.prod.yml` as a single **Docker Compose** resource, set the
environment variables from `.env.prod.example`, expose the `frontend` service on
your domain, and let Coolify's proxy terminate HTTPS. Point `OLLAMA_BASE_URL` at
wherever Ollama actually runs on that host (its LAN IP, or `host.docker.internal`
if that host uses standard Docker Desktop).

Base path: `/api`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/generate` | Stream drawing ops (SSE) for a prompt. Body: `prompt`, `diagram_id?`, `canvas_state?`, `detail_level` (`hld`\|`lld`), `parent_node_id?` |
| `GET` | `/diagrams` | List diagrams |
| `POST` | `/diagrams` | Create a diagram |
| `GET` | `/diagrams/{id}` | Get one diagram |
| `PATCH` | `/diagrams/{id}` | Update name / canvas state |
| `DELETE` | `/diagrams/{id}` | Delete a diagram |
| `POST` | `/diagrams/{parent_id}/drilldown` | Create/return a child diagram for a node |

**SSE wire format** (from `/generate`):

```
data: {"event": "CREATE_NODE", "id": "svc", "type": "service", "label": "App", "x": 950, "y": 100}

data: {"event": "CONNECT_NODES", "id": "e1", "fromId": "gw", "toId": "svc", "label": "REST"}

data: {"event": "DIAGRAM_ID", "id": "<uuid>"}
```

On failure a single `{"event": "ERROR", "message": "..."}` op is emitted instead of a broken stream.

---

## Usage

1. **Generate an HLD** — type a system description in the prompt bar and submit.
2. **Drill down** — double-click a node to open its child diagram; if empty, an LLD class diagram is generated automatically for that component.
3. **Navigate** — use the breadcrumb to move between parent/child diagrams.
4. **Refine** — submit another prompt while a diagram is open to edit it incrementally.
5. **Browse** — the Diagrams sidebar lists everything you've created.

---

## Performance & tuning

- **Thinking latency.** The `BuiltInPlanner` makes Gemma reason before drawing, which improves quality but adds time — LLD passes especially. If you need it faster, give the planner a `thinkingBudget` or remove the planner from a builder.
- **`num_ctx=131072` is aggressive.** It enables large diagrams but is memory-hungry and was the cause of earlier out-of-memory (`exit 137`) kills. If you're not generating huge diagrams, drop `OLLAMA_NUM_CTX` to `32768` for much lower memory pressure.
- **Model size.** `gemma4:26b` needs substantial RAM/VRAM. On constrained machines, substitute a smaller tool-capable model via `OLLAMA_MODEL`.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `DATABASE_URL must be set` on startup | Populate `backend/.env` with a valid `postgresql+asyncpg://…` URL |
| `Address already in use` on `:8008` | A backend is already running — `lsof -ti :8008 \| xargs kill -9` |
| Dev server killed with `exit 137` | Out of memory — lower `OLLAMA_NUM_CTX` (see tuning) |
| Blank diagram / `ERROR` op returned | Model produced no tool calls; rephrase the prompt. The builder already retries once automatically |
| Can't reach model | Ensure Ollama is running (`ollama list`) and `OLLAMA_BASE_URL` is correct |
| Container: `Connection refused` to Ollama | Host Ollama is bound to `127.0.0.1` only, or `OLLAMA_BASE_URL` uses the wrong host address. Start Ollama with `OLLAMA_HOST=0.0.0.0:11434 ollama serve` (quit the menu-bar app first) and use the correct host address for your runtime (see [Deployment](#deployment) — e.g. `192.168.5.2` for Rancher Desktop/Lima) |
| `Event from an unknown agent` logs | Benign — silenced by default; it's the critic seeing the builder's shared-session events |

---

## Design notes & caveats

- **Optimized where it matters:** the generation backend genuinely exploits ADK (multi-agent orchestration, typed tool schemas, planner) and Gemma 4 26B (native tool-calling, thinking, large context). The surrounding app (frontend, persistence) is conventional.
- **No Alembic:** schema is created via `Base.metadata.create_all` plus idempotent `ALTER … IF NOT EXISTS` migrations in the FastAPI lifespan.
- **Streaming is per-model-turn**, not per-token — inherent to the tool-calling approach.
- **No automated test suite** yet around the agent pipeline; validation is via live smoke tests.
- **Local-first:** all inference runs on your machine through Ollama; nothing is sent to a hosted LLM.
