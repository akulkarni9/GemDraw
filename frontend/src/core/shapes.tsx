import {
  BaseBoxShapeUtil,
  HTMLContainer,
  RecordProps,
  T,
  TLBaseShape,
} from '@tldraw/tldraw'

export type GemNodeType = 'service' | 'database' | 'cache' | 'queue' | 'load_balancer' | 'client'

export type GemNodeShape = TLBaseShape<
  'gem-node',
  { w: number; h: number; label: string; nodeType: GemNodeType; nodeId: string }
>

const NODE_STYLES: Record<GemNodeType, { border: string; bg: string; icon: string }> = {
  service:       { border: '#60a5fa', bg: '#1e3a5f', icon: '⚙️' },
  database:      { border: '#34d399', bg: '#1a3a2a', icon: '🗄️' },
  cache:         { border: '#f59e0b', bg: '#3a2a0a', icon: '⚡' },
  queue:         { border: '#a78bfa', bg: '#2a1a4a', icon: '📨' },
  load_balancer: { border: '#f97316', bg: '#3a1a0a', icon: '⚖️' },
  client:        { border: '#94a3b8', bg: '#1a2030', icon: '🖥️' },
}

export class GemNodeShapeUtil extends BaseBoxShapeUtil<GemNodeShape> {
  static override readonly type = 'gem-node' as const

  static override readonly props: RecordProps<GemNodeShape> = {
    w: T.number,
    h: T.number,
    label: T.string,
    nodeType: T.string as T.Validator<GemNodeType>,
    nodeId: T.string,
  }

  override getDefaultProps() {
    return { w: 180, h: 72, label: 'Node', nodeType: 'service' as GemNodeType, nodeId: '' }
  }

  override canEdit = () => false
  override canResize = () => true

  override component(shape: GemNodeShape) {
    const style = NODE_STYLES[shape.props.nodeType] ?? NODE_STYLES.service
    return (
      <HTMLContainer
        style={{
          width: shape.props.w,
          height: shape.props.h,
          border: `2px solid ${style.border}`,
          borderRadius: 8,
          background: style.bg,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          padding: '0 8px',
          userSelect: 'none',
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        <span style={{ fontSize: 20 }}>{style.icon}</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#f1f5f9',
            textAlign: 'center',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            width: '100%',
            textShadow: '0 1px 2px #0008',
          }}
        >
          {shape.props.label}
        </span>
        <span
          style={{
            fontSize: 9,
            color: style.border,
            textTransform: 'uppercase',
            letterSpacing: 1,
            opacity: 0.8,
          }}
        >
          {shape.props.nodeType.replace('_', ' ')}
        </span>
      </HTMLContainer>
    )
  }

  override indicator(shape: GemNodeShape) {
    return (
      <rect
        width={shape.props.w}
        height={shape.props.h}
        rx={8}
        fill="none"
        stroke={NODE_STYLES[shape.props.nodeType]?.border ?? '#60a5fa'}
        strokeWidth={2}
      />
    )
  }
}

export type Visibility = '+' | '-' | '#' | '~'

export interface ClassField {
  visibility: Visibility
  name: string
  type: string
}

export interface ClassMethod {
  visibility: Visibility
  name: string
  params: string
  returns: string
}

export type GemClassShape = TLBaseShape<
  'gem-class',
  {
    w: number
    h: number
    name: string
    stereotype: string
    fields: ClassField[]
    methods: ClassMethod[]
  }
>

const CLASS_WIDTH = 260
const HEADER_H = 40
const ROW_H = 20
const COMPARTMENT_PAD = 8

export function classShapeHeight(fieldCount: number, methodCount: number): number {
  const fieldsH = COMPARTMENT_PAD * 2 + Math.max(fieldCount, 1) * ROW_H
  const methodsH = COMPARTMENT_PAD * 2 + Math.max(methodCount, 1) * ROW_H
  return HEADER_H + fieldsH + methodsH
}

const VIS_COLOR: Record<Visibility, string> = {
  '+': '#34d399',
  '-': '#f87171',
  '#': '#fbbf24',
  '~': '#94a3b8',
}

export class GemClassShapeUtil extends BaseBoxShapeUtil<GemClassShape> {
  static override readonly type = 'gem-class' as const

  static override readonly props: RecordProps<GemClassShape> = {
    w: T.number,
    h: T.number,
    name: T.string,
    stereotype: T.string,
    fields: T.arrayOf(
      T.object({
        visibility: T.string as T.Validator<Visibility>,
        name: T.string,
        type: T.string,
      }),
    ),
    methods: T.arrayOf(
      T.object({
        visibility: T.string as T.Validator<Visibility>,
        name: T.string,
        params: T.string,
        returns: T.string,
      }),
    ),
  }

  override getDefaultProps(): GemClassShape['props'] {
    return { w: CLASS_WIDTH, h: classShapeHeight(0, 0), name: 'Class', stereotype: '', fields: [], methods: [] }
  }

  override canEdit = () => false
  override canResize = () => false

  private row(text: string, visibility: Visibility, key: string) {
    return (
      <div
        key={key}
        style={{
          height: ROW_H,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          fontFamily: 'ui-monospace, monospace',
          color: '#e2e8f0',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <span style={{ color: VIS_COLOR[visibility], fontWeight: 700 }}>{visibility}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
      </div>
    )
  }

  override component(shape: GemClassShape) {
    const { name, stereotype, fields, methods } = shape.props
    return (
      <HTMLContainer
        style={{
          width: shape.props.w,
          height: shape.props.h,
          border: '2px solid #818cf8',
          borderRadius: 6,
          background: '#1e1b3a',
          display: 'flex',
          flexDirection: 'column',
          userSelect: 'none',
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: HEADER_H,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#2e2a55',
            borderBottom: '1px solid #818cf8',
          }}
        >
          {stereotype && (
            <span style={{ fontSize: 9, color: '#a5b4fc', letterSpacing: 1 }}>
              «{stereotype}»
            </span>
          )}
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{name}</span>
        </div>
        <div style={{ padding: COMPARTMENT_PAD, borderBottom: '1px solid #3f3a6a', flex: 'none' }}>
          {fields.length === 0
            ? this.row('\u00A0', '~', 'no-fields')
            : fields.map((f, i) => this.row(`${f.name}: ${f.type}`, f.visibility, `f${i}`))}
        </div>
        <div style={{ padding: COMPARTMENT_PAD, flex: 'none' }}>
          {methods.length === 0
            ? this.row('\u00A0', '~', 'no-methods')
            : methods.map((m, i) =>
                this.row(`${m.name}(${m.params})${m.returns ? ': ' + m.returns : ''}`, m.visibility, `m${i}`),
              )}
        </div>
      </HTMLContainer>
    )
  }

  override indicator(shape: GemClassShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} fill="none" stroke="#818cf8" strokeWidth={2} />
  }
}
