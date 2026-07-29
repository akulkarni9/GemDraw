import { Editor } from '@tldraw/tldraw'
import { extractCanvasState } from './canvasStateExtractor'
import { applyDrawingOp } from './tldrawOpsAdapter'

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

export type DetailLevel = 'hld' | 'lld'

export interface StreamCallbacks {
  onDiagramId?: (id: string) => void
  onDone?: () => void
  onError?: (err: Error) => void
}

async function fetchGenerateResponse(
  prompt: string,
  diagramId: string | null,
  canvasState: unknown,
  detailLevel: DetailLevel,
  parentNodeId: string | null,
  onError: (err: Error) => void,
): Promise<Response | null> {
  try {
    return await fetch(`${API_BASE}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        diagram_id: diagramId ?? undefined,
        canvas_state: canvasState,
        detail_level: detailLevel,
        parent_node_id: parentNodeId ?? undefined,
      }),
    })
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    return null
  }
}

function processStreamLine(
  line: string,
  editor: Editor,
  callbacks: StreamCallbacks,
): boolean {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return false

  const payload = trimmed.slice(5).trim()
  if (!payload) return false

  let event: Record<string, unknown>
  try {
    event = JSON.parse(payload)
  } catch {
    return false
  }

  if (event.event === 'DIAGRAM_ID') {
    callbacks.onDiagramId?.(event.id as string)
    return true
  }

  editor.run(() => applyDrawingOp(editor, event))
  return true
}

async function processStreamChunk(
  value: Uint8Array,
  decoder: TextDecoder,
  buffer: { value: string },
  editor: Editor,
  callbacks: StreamCallbacks,
): Promise<void> {
  buffer.value += decoder.decode(value, { stream: true })
  const lines = buffer.value.split('\n')
  buffer.value = lines.pop() ?? ''

  for (const line of lines) {
    processStreamLine(line, editor, callbacks)
  }
}

export async function submitPrompt(
  editor: Editor,
  prompt: string,
  diagramId: string | null,
  detailLevel: DetailLevel,
  parentNodeId: string | null,
  callbacks: StreamCallbacks,
): Promise<void> {
  const canvasState = extractCanvasState(editor)

  const response = await fetchGenerateResponse(
    prompt,
    diagramId,
    canvasState,
    detailLevel,
    parentNodeId,
    callbacks.onError ?? (() => {}),
  )

  if (!response?.ok || !response.body) {
    callbacks.onError?.(new Error(`HTTP ${response?.status ?? 'unknown'}`))
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const buffer = { value: '' }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      await processStreamChunk(value, decoder, buffer, editor, callbacks)
    }
  } finally {
    reader.releaseLock()
    callbacks.onDone?.()
  }
}

export async function fetchDiagrams(): Promise<{ id: string; name: string; updated_at: string }[]> {
  const res = await fetch(`${API_BASE}/diagrams`)
  if (!res.ok) return []
  return res.json()
}

export interface DiagramMeta {
  id: string
  name: string
  canvas_state: { nodes: unknown[]; edges: unknown[]; classes?: unknown[]; relations?: unknown[] }
  parent_diagram_id: string | null
  parent_node_id: string | null
}

export async function loadDiagram(id: string): Promise<{ canvas_state: { nodes: unknown[]; edges: unknown[] } } | null> {
  const res = await fetch(`${API_BASE}/diagrams/${id}`)
  if (!res.ok) return null
  return res.json()
}

export async function drillDown(parentId: string, nodeId: string): Promise<DiagramMeta | null> {
  const res = await fetch(`${API_BASE}/diagrams/${parentId}/drilldown`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_id: nodeId }),
  })
  if (!res.ok) return null
  return res.json()
}
