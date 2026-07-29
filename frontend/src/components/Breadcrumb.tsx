import { DetailLevel } from '../core/streamOrchestrator'

export interface Crumb {
  id: string
  label: string
  detailLevel: DetailLevel
  parentNodeId: string | null
}

interface Props {
  trail: Crumb[]
  onNavigate: (index: number) => void
}

export default function Breadcrumb({ trail, onNavigate }: Readonly<Props>) {
  if (trail.length <= 1) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: '#1a1a2e',
        border: '1px solid #334155',
        borderRadius: 10,
        padding: '6px 12px',
        boxShadow: '0 4px 16px #0006',
        zIndex: 500,
        maxWidth: 'calc(100vw - 320px)',
        overflowX: 'auto',
      }}
    >
      {trail.map((crumb, i) => {
        const isLast = i === trail.length - 1
        return (
          <span key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <span style={{ color: '#475569', fontSize: 12 }}>/</span>}
            <button
              type="button"
              onClick={() => !isLast && onNavigate(i)}
              disabled={isLast}
              title={crumb.detailLevel === 'lld' ? 'Low-level design' : 'High-level design'}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: isLast ? 'default' : 'pointer',
                color: isLast ? '#f1f5f9' : '#60a5fa',
                fontSize: 13,
                fontWeight: isLast ? 700 : 500,
                whiteSpace: 'nowrap',
                padding: '2px 4px',
              }}
            >
              {crumb.label}
            </button>
          </span>
        )
      })}
    </div>
  )
}
