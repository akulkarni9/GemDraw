import { Editor, TLShapeId, createShapeId } from '@tldraw/tldraw'
import { GemNodeType, GemClassShape, ClassField, ClassMethod, Visibility, classShapeHeight } from './shapes'

const NODE_SIZE = { w: 180, h: 72 }

type Op = Record<string, unknown>
type OpHandler = (editor: Editor, op: Op) => void

// Stable deterministic mapping: logical ID → tldraw shape ID (shape:<logicalId>)
export function resetIdMap() {
  // no-op: IDs are now deterministic via createShapeId(logicalId)
}

function getTldrawId(logicalId: string): TLShapeId {
  return createShapeId(logicalId)
}

// Create (or update) a bound arrow between two existing shapes with a
// deterministic ID so re-emitted connections don't stack duplicates.
function upsertArrow(
  editor: Editor,
  edgeId: TLShapeId,
  fromId: TLShapeId,
  toId: TLShapeId,
  text: string,
  color: string,
) {
  if (editor.getShape(edgeId)) {
    editor.updateShape({ id: edgeId, type: 'arrow', props: { text, size: 's', font: 'sans' } })
    return
  }
  editor.createShape({
    id: edgeId,
    type: 'arrow',
    props: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, text, color, size: 's', font: 'sans' },
  })
  editor.createBinding({
    type: 'arrow',
    fromId: edgeId,
    toId: fromId,
    props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false },
  })
  editor.createBinding({
    type: 'arrow',
    fromId: edgeId,
    toId: toId,
    props: { terminal: 'end', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false },
  })
}

const createNode: OpHandler = (editor, op) => {
  const shapeId = getTldrawId(op.id as string)
  const props = {
    label: op.label as string,
    nodeType: op.type as GemNodeType,
    nodeId: op.id as string,
    w: NODE_SIZE.w,
    h: NODE_SIZE.h,
  }
  // Upsert: on follow-up edits the model often re-emits CREATE_NODE for
  // existing IDs. createShape silently ignores duplicate IDs, which would
  // drop the edit, so update the shape in place when it already exists.
  const patch = { id: shapeId, type: 'gem-node' as const, x: op.x as number, y: op.y as number, props }
  if (editor.getShape(shapeId)) {
    editor.updateShape(patch)
  } else {
    editor.createShape(patch)
  }
}

const connectNodes: OpHandler = (editor, op) => {
  const edgeId = createShapeId(`edge_${op.fromId}_${op.toId}`)
  upsertArrow(
    editor,
    edgeId,
    getTldrawId(op.fromId as string),
    getTldrawId(op.toId as string),
    (op.label as string) || '',
    'grey',
  )
}

const groupNodes: OpHandler = (editor, op) => {
  const childIds = ((op.nodeIds as string[]) || []).map(getTldrawId)
  const shapes = childIds.map(id => editor.getShape(id)).filter(Boolean)
  if (shapes.length === 0) return

  const xs = shapes.map(s => s!.x)
  const ys = shapes.map(s => s!.y)
  const minX = Math.min(...xs) - 40
  const minY = Math.min(...ys) - 60
  const maxX = Math.max(...xs) + NODE_SIZE.w + 40
  const maxY = Math.max(...ys) + NODE_SIZE.h + 40

  // Key the frame on its label so a re-emitted (or duplicate) group updates the
  // same rectangle in place instead of stacking overlapping boxes.
  const label = (op.label as string) || 'Group'
  const frameId = createShapeId(`group_${label}`)
  const patch = {
    id: frameId,
    type: 'geo' as const,
    x: minX,
    y: minY,
    props: {
      geo: 'rectangle' as const,
      w: maxX - minX,
      h: maxY - minY,
      // Transparent fill + dashed outline so it frames nodes without hiding them.
      fill: 'none' as const,
      dash: 'dashed' as const,
      color: 'grey' as const,
      size: 's' as const,
      font: 'sans' as const,
      labelColor: 'grey' as const,
      verticalAlign: 'start' as const,
      text: label,
    },
  }
  if (editor.getShape(frameId)) {
    editor.updateShape(patch)
  } else {
    editor.createShape(patch)
  }
  // Keep the frame behind the nodes it surrounds (no reparenting, so nodes stay
  // independently selectable and fully visible on top).
  editor.sendToBack([frameId])
}

const modifyNode: OpHandler = (editor, op) => {
  const shapeId = getTldrawId(op.id as string)
  const updates = op.updates as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  if (updates.x !== undefined) patch.x = updates.x
  if (updates.y !== undefined) patch.y = updates.y
  if (updates.label !== undefined) patch.props = { label: updates.label }
  editor.updateShape({ id: shapeId, type: 'gem-node', ...patch })
}

const deleteNode: OpHandler = (editor, op) => {
  editor.deleteShape(getTldrawId(op.id as string))
}

const createClass: OpHandler = (editor, op) => {
  const shapeId = getTldrawId(op.id as string)
  const props = { name: op.name as string, stereotype: (op.stereotype as string) || '' }
  if (editor.getShape(shapeId)) {
    editor.updateShape({ id: shapeId, type: 'gem-class', x: op.x as number, y: op.y as number, props })
  } else {
    editor.createShape({
      id: shapeId,
      type: 'gem-class',
      x: op.x as number,
      y: op.y as number,
      props: { ...props, fields: [], methods: [] },
    })
  }
}

const addField: OpHandler = (editor, op) => {
  const shapeId = getTldrawId(op.classId as string)
  const shape = editor.getShape(shapeId) as GemClassShape | undefined
  if (!shape) return
  const field: ClassField = {
    visibility: (op.visibility as Visibility) || '-',
    name: op.name as string,
    type: (op.type as string) || '',
  }
  const fields = [...shape.props.fields.filter(f => f.name !== field.name), field]
  editor.updateShape({
    id: shapeId,
    type: 'gem-class',
    props: { fields, h: classShapeHeight(fields.length, shape.props.methods.length) },
  })
}

const addMethod: OpHandler = (editor, op) => {
  const shapeId = getTldrawId(op.classId as string)
  const shape = editor.getShape(shapeId) as GemClassShape | undefined
  if (!shape) return
  const method: ClassMethod = {
    visibility: (op.visibility as Visibility) || '+',
    name: op.name as string,
    params: (op.params as string) || '',
    returns: (op.returns as string) || '',
  }
  const methods = [...shape.props.methods.filter(m => m.name !== method.name), method]
  editor.updateShape({
    id: shapeId,
    type: 'gem-class',
    props: { methods, h: classShapeHeight(shape.props.fields.length, methods.length) },
  })
}

const createRelation: OpHandler = (editor, op) => {
  const relId = createShapeId(`rel_${op.fromId}_${op.toId}`)
  upsertArrow(
    editor,
    relId,
    getTldrawId(op.fromId as string),
    getTldrawId(op.toId as string),
    (op.label as string) || '',
    'violet',
  )
}

const OP_HANDLERS: Record<string, OpHandler> = {
  CREATE_NODE: createNode,
  CONNECT_NODES: connectNodes,
  GROUP_NODES: groupNodes,
  MODIFY_NODE: modifyNode,
  DELETE_NODE: deleteNode,
  CREATE_CLASS: createClass,
  ADD_FIELD: addField,
  ADD_METHOD: addMethod,
  CREATE_RELATION: createRelation,
}

export function applyDrawingOp(editor: Editor, op: Op) {
  OP_HANDLERS[op.event as string]?.(editor, op)
}
