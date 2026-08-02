# GemDraw — Frontend

React + TypeScript single-page app that renders AI-generated architecture diagrams on a [tldraw](https://tldraw.dev) canvas. It streams drawing commands from the backend over Server-Sent Events and applies them live.

> For the full product overview see the [root README](../README.md).

---

## Stack

- **React 18** + **TypeScript**
- **tldraw v2** (`@tldraw/tldraw`) — canvas + custom shapes
- **Vite** — dev server, build, and `/api` proxy

---

## Layout

```
frontend/
├── vite.config.ts             # dev server (:5173) + /api proxy
├── Dockerfile                 # multi-stage build → nginx (production)
├── nginx.conf                 # SPA fallback + SSE-safe /api proxy
├── package.json
└── src/
    ├── main.tsx               # entry point
    ├── components/
    │   ├── App.tsx            # top-level state & wiring
    │   ├── CanvasEngine.tsx   # tldraw canvas host
    │   ├── PromptBar.tsx      # prompt input
    │   ├── DiagramSidebar.tsx # saved-diagram list
    │   └── Breadcrumb.tsx     # HLD → LLD navigation
    └── core/
        ├── streamOrchestrator.ts   # fetch + SSE stream handling
        ├── tldrawOpsAdapter.ts     # drawing-event → tldraw shape mapping
        ├── canvasStateExtractor.ts # read current canvas back into state
        └── shapes.tsx              # custom node & UML class shapes
```

---

## Setup

Requires **Node.js 18+** and the [backend](../backend/README.md) running on `http://localhost:8008`.

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**.

### Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the Vite dev server on `:5173` |
| `npm run build` | Type-check (`tsc -b`) and build for production |
| `npm run preview` | Preview the production build |

---

## Configuration

Vite proxies `/api` to the backend. Override the target with an env var if the backend runs elsewhere:

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_TARGET` | `http://localhost:8008` | Backend base URL for the dev-server `/api` proxy |
| `VITE_API_BASE` | `/api` | API base path baked in at **build** time (build arg in the Dockerfile) |

```bash
VITE_API_TARGET=http://localhost:9000 npm run dev
```

### Production build

The `Dockerfile` builds the SPA and serves it with nginx, which also proxies
`/api` to the `backend` service with SSE-safe settings (buffering off, long read
timeouts). It's built and run as part of `docker-compose.prod.yml` — see the
[root README Deployment section](../README.md#deployment).

---

## How it works

1. **`PromptBar`** submits a prompt; **`App`** calls the backend via **`streamOrchestrator`**.
2. `streamOrchestrator` opens the SSE stream from `POST /api/generate` and parses each `data: {…}` line.
3. **`tldrawOpsAdapter`** maps each drawing event (`CREATE_NODE`, `CONNECT_NODES`, `CREATE_CLASS`, …) to tldraw shapes defined in **`shapes.tsx`**, updating the canvas in real time.
4. Double-clicking a node triggers a **drill-down**: a child diagram is opened and an LLD class diagram is auto-generated for that component.
5. **`canvasStateExtractor`** reads the current canvas back into state so follow-up prompts can edit the existing diagram.
6. **`Breadcrumb`** and **`DiagramSidebar`** handle navigation between parent/child diagrams and saved diagrams.

---

## Notes

- The dev server must be able to reach the backend for generation to work; ensure it's up first.
- Diagram persistence is handled server-side — the frontend renders and reads canvas state but does not store diagrams itself.
