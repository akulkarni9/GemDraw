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

  useEffect(() => {
    if (open) fetchDiagrams().then(setDiagrams)
  }, [open])

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'absolute',
          top: 64,
          left: 16,
          zIndex: 500,
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
