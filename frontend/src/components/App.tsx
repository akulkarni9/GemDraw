import { useCallback, useRef, useState } from 'react'
import { Editor } from '@tldraw/tldraw'
import CanvasEngine from './CanvasEngine'
import PromptBar from './PromptBar'
import DiagramSidebar from './DiagramSidebar'
import Breadcrumb, { Crumb } from './Breadcrumb'
import { submitPrompt, drillDown, DetailLevel } from '../core/streamOrchestrator'
import { resetIdMap } from '../core/tldrawOpsAdapter'

export default function App() {
  const editorRef = useRef<Editor | null>(null)
  const busyRef = useRef(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [diagramId, setDiagramId] = useState<string | null>(null)
  const [diagramIdToLoad, setDiagramIdToLoad] = useState<string | null>(null)
  const [detailLevel, setDetailLevel] = useState<DetailLevel>('hld')
  const [parentNodeId, setParentNodeId] = useState<string | null>(null)
  const [trail, setTrail] = useState<Crumb[]>([])

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor
  }, [])

  // Core generation runner. Accepts explicit context so callers (manual submit
  // and auto drill-down) don't depend on possibly-stale React state.
  const runGeneration = useCallback(
    async (
      prompt: string,
      ctx: { diagramId: string | null; detailLevel: DetailLevel; parentNodeId: string | null },
    ) => {
      const editor = editorRef.current
      if (!editor) return
      setLoading(true)
      setStatus(ctx.detailLevel === 'lld' ? 'Generating class diagram…' : 'Generating architecture…')
      await submitPrompt(editor, prompt, ctx.diagramId, ctx.detailLevel, ctx.parentNodeId, {
        onDiagramId: id => {
          setDiagramId(id)
          // Seed the breadcrumb for a brand-new top-level diagram.
          setTrail(prev =>
            prev.length === 0 ? [{ id, label: 'Architecture', detailLevel: 'hld', parentNodeId: null }] : prev,
          )
        },
        onDone: () => {
          setLoading(false)
          setStatus('Done')
          setTimeout(() => setStatus(null), 3000)
        },
        onError: err => {
          setLoading(false)
          setStatus(`Error: ${err.message}`)
        },
      })
    },
    [],
  )

  const handleSubmit = useCallback(
    async (prompt: string) => {
      await runGeneration(prompt, { diagramId, detailLevel, parentNodeId })
    },
    [runGeneration, diagramId, detailLevel, parentNodeId],
  )

  const clearCanvas = useCallback(() => {
    const editor = editorRef.current
    if (editor) {
      editor.selectAll()
      editor.deleteShapes(editor.getSelectedShapeIds())
    }
  }, [])

  const handleNodeDoubleClick = useCallback(
    async (nodeId: string) => {
      if (!diagramId || busyRef.current) return
      busyRef.current = true
      setLoading(true)
      setStatus(`Opening ${nodeId}…`)
      const child = await drillDown(diagramId, nodeId)
      if (!child) {
        setLoading(false)
        setStatus('Error: could not open drill-down')
        busyRef.current = false
        return
      }
      resetIdMap()
      clearCanvas()
      setDiagramId(child.id)
      setDiagramIdToLoad(child.id)
      setDetailLevel('lld')
      setParentNodeId(child.parent_node_id)
      setTrail(prev => {
        // Avoid pushing a duplicate crumb for the node we're already viewing.
        if (prev.at(-1)?.id === child.id) return prev
        return [...prev, { id: child.id, label: nodeId, detailLevel: 'lld', parentNodeId: child.parent_node_id }]
      })

      // If the child diagram has no classes yet, auto-generate the class diagram.
      const classes = (child.canvas_state as { classes?: unknown[] })?.classes ?? []
      if (classes.length === 0) {
        await runGeneration(`Detail the "${nodeId}" component as a UML class diagram.`, {
          diagramId: child.id,
          detailLevel: 'lld',
          parentNodeId: child.parent_node_id,
        })
      } else {
        setLoading(false)
        setStatus(null)
      }
      busyRef.current = false
    },
    [diagramId, runGeneration, clearCanvas],
  )

  const handleNavigate = useCallback(
    (index: number) => {
      const crumb = trail[index]
      if (!crumb) return
      resetIdMap()
      clearCanvas()
      setTrail(trail.slice(0, index + 1))
      setDiagramId(crumb.id)
      setDiagramIdToLoad(crumb.id)
      setDetailLevel(crumb.detailLevel)
      setParentNodeId(crumb.parentNodeId)
    },
    [trail, clearCanvas],
  )

  const handleSelectDiagram = useCallback((id: string) => {
    resetIdMap()
    setDiagramId(id)
    setDiagramIdToLoad(id)
    setDetailLevel('hld')
    setParentNodeId(null)
    setTrail([{ id, label: 'Architecture', detailLevel: 'hld', parentNodeId: null }])
  }, [])

  const handleNewDiagram = useCallback(() => {
    resetIdMap()
    setDiagramId(null)
    setDiagramIdToLoad(null)
    setDetailLevel('hld')
    setParentNodeId(null)
    setTrail([])
    setStatus(null)
    clearCanvas()
  }, [clearCanvas])

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <CanvasEngine
        onEditorReady={handleEditorReady}
        diagramIdToLoad={diagramIdToLoad}
        onNodeDoubleClick={handleNodeDoubleClick}
      />
      <Breadcrumb trail={trail} onNavigate={handleNavigate} />
      <DiagramSidebar
        currentDiagramId={diagramId}
        onSelect={handleSelectDiagram}
        onNew={handleNewDiagram}
      />
      <PromptBar
        onSubmit={handleSubmit}
        loading={loading}
        status={status}
        detailLevel={detailLevel}
        onDetailLevelChange={setDetailLevel}
      />
    </div>
  )
}
