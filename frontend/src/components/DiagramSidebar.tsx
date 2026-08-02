import { useEffect, useState } from 'react'
import { fetchDiagrams } from '../core/streamOrchestrator'

interface DiagramMeta {
  id: string
  name: string
  updated_at: string
}

interface Props {
  currentDiagramId: string | null
  onSelect: (id: string) => void
  onNew: () => void
}

export default function DiagramSidebar({ currentDiagramId, onSelect, onNew }: Readonly<Props>) {
  const [diagrams, setDiagrams] = useState<DiagramMeta[]>([])
  const [open, setOpen] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    if (open) fetchDiagrams().then(setDiagrams)
  }, [open])

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 64,
          left: 16,
          zIndex: 500,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            background: '#1a1a2e',
            border: '1.5px solid #334155',
            borderRadius: 8,
            color: '#f1f5f9',
            padding: '6px 12px',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          {open ? '✕ Close' : '☰ Diagrams'}
        </button>

        <div
          style={{ position: 'relative', display: 'flex' }}
          onMouseEnter={() => setShowHelp(true)}
          onMouseLeave={() => setShowHelp(false)}
        >
          <button
            type="button"
            aria-label="How to use GemDraw"
            onClick={() => setShowHelp(h => !h)}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: '#1a1a2e',
              border: '1.5px solid #334155',
              color: '#93c5fd',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ⓘ
          </button>

          {showHelp && (
            <div
              role="tooltip"
              style={{
                position: 'absolute',
                top: 36,
                left: 0,
                width: 300,
                background: '#12121f',
                border: '1.5px solid #334155',
                borderRadius: 10,
                boxShadow: '0 8px 32px #000a',
                padding: '12px 14px',
                fontSize: 12.5,
                lineHeight: 1.55,
                color: '#cbd5e1',
                zIndex: 600,
              }}
            >
              <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: 6, fontSize: 13 }}>
                How to use GemDraw
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <li>
                  <strong style={{ color: '#93c5fd' }}>Describe</strong> your system in the prompt box, or pick an
                  <strong> Easy / Medium / Difficult</strong> suggestion, then press Enter.
                </li>
                <li>
                  Toggle <strong style={{ color: '#93c5fd' }}>HLD</strong> for a high-level architecture or
                  <strong> LLD</strong> for a low-level class diagram.
                </li>
                <li>
                  <strong style={{ color: '#93c5fd' }}>Double-click</strong> any node in an HLD to drill down into its
                  detailed class design.
                </li>
                <li>
                  Open <strong style={{ color: '#93c5fd' }}>☰ Diagrams</strong> to start a new diagram or reload a
                  previously saved one.
                </li>
                <li>
                  Diagrams save automatically — drag, edit, and connect shapes freely on the canvas.
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 100,
            left: 16,
            zIndex: 500,
            background: '#1a1a2e',
            border: '1.5px solid #334155',
            borderRadius: 10,
            width: 240,
            maxHeight: 400,
            overflowY: 'auto',
            boxShadow: '0 8px 32px #0008',
            padding: 8,
          }}
        >
          <button
            onClick={() => { onNew(); setOpen(false) }}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: '#3b82f6',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              marginBottom: 8,
            }}
          >
            + New Diagram
          </button>
          {diagrams.length === 0 && (
            <p style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: 8 }}>No saved diagrams</p>
          )}
          {diagrams.map(d => (
            <button
              key={d.id}
              onClick={() => { onSelect(d.id); setOpen(false) }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                background: d.id === currentDiagramId ? '#1e3a5f' : 'transparent',
                border: 'none',
                borderRadius: 6,
                color: '#f1f5f9',
                cursor: 'pointer',
                fontSize: 13,
                marginBottom: 2,
              }}
            >
              <div style={{ fontWeight: 600 }}>{d.name}</div>
              <div style={{ color: '#64748b', fontSize: 11 }}>
                {new Date(d.updated_at).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
