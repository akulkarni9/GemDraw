import { Editor, TLArrowShape, getArrowBindings } from '@tldraw/tldraw'
import { GemNodeShape } from './shapes'

export interface SpatialNode {
  id: string
  type: string
  label: string
  x: number
  y: number
}

export interface SpatialEdge {
  id: string
  fromId: string
  toId: string
  label: string
}

export interface ActiveSpatialGraph {
  nodes: SpatialNode[]
  edges: SpatialEdge[]
}

function processArrowShape(editor: Editor, arrow: TLArrowShape): SpatialEdge | null {
  const bindings = getArrowBindings(editor, arrow)
  if (!bindings.start || !bindings.end) {
    return null
  }

  const fromShape = editor.getShape(bindings.start.toId)
  const toShape = editor.getShape(bindings.end.toId)
  const fromNodeId = fromShape?.type === 'gem-node' ? (fromShape as GemNodeShape).props.nodeId : bindings.start.toId
  const toNodeId = toShape?.type === 'gem-node' ? (toShape as GemNodeShape).props.nodeId : bindings.end.toId

  return {
    id: arrow.id,
    fromId: fromNodeId,
    toId: toNodeId,
    label: arrow.props.text || '',
  }
}

function processGemNode(shape: GemNodeShape): SpatialNode {
  return {
    id: shape.props.nodeId || shape.id,
    type: shape.props.nodeType,
    label: shape.props.label,
    x: Math.round(shape.x),
    y: Math.round(shape.y),
  }
}

export function extractCanvasState(editor: Editor): ActiveSpatialGraph {
  const nodes: SpatialNode[] = []
  const edges: SpatialEdge[] = []

  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type === 'gem-node') {
      nodes.push(processGemNode(shape as GemNodeShape))
    } else if (shape.type === 'arrow') {
      const edge = processArrowShape(editor, shape as TLArrowShape)
      if (edge) {
        edges.push(edge)
      }
    }
  }

  return { nodes, edges }
}
