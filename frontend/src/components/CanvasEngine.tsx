import { useCallback, useEffect, useRef } from 'react'
import { Tldraw, Editor } from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css'
import { GemNodeShapeUtil, GemClassShapeUtil, GemNodeShape } from '../core/shapes'
import { applyDrawingOp, resetIdMap } from '../core/tldrawOpsAdapter'
import { loadDiagram } from '../core/streamOrchestrator'

const CUSTOM_SHAPE_UTILS = [GemNodeShapeUtil, GemClassShapeUtil]

interface Props {
  onEditorReady: (editor: Editor) => void
  diagramIdToLoad: string | null
  onNodeDoubleClick: (nodeId: string) => void
}

export default function CanvasEngine({ onEditorReady, diagramIdToLoad, onNodeDoubleClick }: Readonly<Props>) {
  const editorRef = useRef<Editor | null>(null)
  const onNodeDoubleClickRef = useRef(onNodeDoubleClick)
  onNodeDoubleClickRef.current = onNodeDoubleClick

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor
      editor.updateInstanceState({ isDebugMode: false })
      onEditorReady(editor)

      // Double-click an HLD node to drill down into its low-level design.
      editor.on('event', info => {
        if (info.name !== 'double_click' || info.phase !== 'up') return
        const shape = editor.getShapeAtPoint(editor.inputs.currentPagePoint, {
          hitInside: true,
          margin: 0,
        })
        if (shape?.type === 'gem-node') {
          const nodeId = (shape as GemNodeShape).props.nodeId
          if (nodeId) onNodeDoubleClickRef.current(nodeId)
        }
      })
    },
    [onEditorReady],
  )

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !diagramIdToLoad) return

    loadDiagram(diagramIdToLoad).then(diagram => {
      const state = diagram?.canvas_state as Record<string, unknown[]> | undefined
      if (!state) return
      resetIdMap()
      editor.selectAll()
      editor.deleteShapes(editor.getSelectedShapeIds())

      const each = (key: string) => (state[key] ?? []) as Record<string, unknown>[]
      // Order matters: create containers (nodes/classes) before their connectors.
      for (const node of each('nodes')) applyDrawingOp(editor, { event: 'CREATE_NODE', ...node })
      for (const cls of each('classes')) {
        applyDrawingOp(editor, { event: 'CREATE_CLASS', ...cls })
        for (const f of (cls.fields as Record<string, unknown>[]) ?? []) {
          applyDrawingOp(editor, { event: 'ADD_FIELD', classId: cls.id, ...f })
        }
        for (const m of (cls.methods as Record<string, unknown>[]) ?? []) {
          applyDrawingOp(editor, { event: 'ADD_METHOD', classId: cls.id, ...m })
        }
      }
      for (const edge of each('edges')) applyDrawingOp(editor, { event: 'CONNECT_NODES', ...edge })
      for (const rel of each('relations')) applyDrawingOp(editor, { event: 'CREATE_RELATION', ...rel })
    })
  }, [diagramIdToLoad])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Tldraw
        shapeUtils={CUSTOM_SHAPE_UTILS}
        onMount={handleMount}
        inferDarkMode
      />
    </div>
  )
}
