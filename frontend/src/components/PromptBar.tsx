import { useState, useRef, KeyboardEvent } from 'react'
import { DetailLevel } from '../core/streamOrchestrator'

interface Props {
  onSubmit: (prompt: string) => void
  loading: boolean
  status: string | null
  detailLevel: DetailLevel
  onDetailLevelChange: (level: DetailLevel) => void
}

type Difficulty = 'Easy' | 'Medium' | 'Difficult'

const SUGGESTIONS: { level: Difficulty; color: string; prompts: string[] }[] = [
  {
    level: 'Easy',
    color: '#34d399',
    prompts: [
      'Design a simple URL shortener service',
      'Design a basic todo list web app',
    ],
  },
  {
    level: 'Medium',
    color: '#fbbf24',
    prompts: [
      'Design a ride-sharing platform like Uber',
      'Design an e-commerce checkout and payment system',
    ],
  },
  {
    level: 'Difficult',
    color: '#f87171',
    prompts: [
      'Design a globally distributed video streaming platform like Netflix',
      'Design a real-time collaborative document editor like Google Docs',
    ],
  },
]

export default function PromptBar({ onSubmit, loading, status, detailLevel, onDetailLevelChange }: Readonly<Props>) {
  const [value, setValue] = useState('')
  const [openGroup, setOpenGroup] = useState<Difficulty | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSubmit() {
    const trimmed = value.trim()
    if (!trimmed || loading) return
    onSubmit(trimmed)
    setValue('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleSuggestion(prompt: string) {
    if (loading) return
    onSubmit(prompt)
    setValue('')
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 76,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(720px, calc(100vw - 48px))',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 500,
      }}
    >
      {status && (() => {
        const isError = status.startsWith('Error')
        let bg = '#1a3a2a'
        let borderColor = '#34d399'
        let color = '#6ee7b7'
        if (loading) { bg = '#1e3a5f'; borderColor = '#3b82f6'; color = '#93c5fd' }
        else if (isError) { bg = '#3a1a1a'; borderColor = '#ef4444'; color = '#fca5a5' }
        return (
        <div
          style={{
            background: bg,
            border: `1px solid ${borderColor}`,
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 13,
            color,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {loading && (
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>
              ◌
            </span>
          )}
          {status}
        </div>
        )
      })()}

      {detailLevel === 'hld' && !value.trim() && !loading && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '0 2px',
          }}
        >
          {SUGGESTIONS.map(group => {
            const isOpen = openGroup === group.level
            return (
              <div key={group.level} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setOpenGroup(isOpen ? null : group.level)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: '#1a1a2e',
                    border: `1px solid ${group.color}55`,
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#e2e8f0',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: group.color,
                      flexShrink: 0,
                    }}
                  />
                  {group.level}
                  <span
                    style={{
                      marginLeft: 'auto',
                      color: '#94a3b8',
                      fontSize: 11,
                      transform: isOpen ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.15s',
                    }}
                  >
                    ▶
                  </span>
                </button>
                {isOpen && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 4px 2px' }}>
                    {group.prompts.map(prompt => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => handleSuggestion(prompt)}
                        style={{
                          background: '#161628',
                          border: `1px solid ${group.color}44`,
                          borderRadius: 999,
                          padding: '5px 11px',
                          fontSize: 12,
                          color: '#cbd5e1',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          background: '#1a1a2e',
          border: `1.5px solid ${loading ? '#3b82f6' : '#334155'}`,
          borderRadius: 14,
          padding: '10px 12px',
          boxShadow: '0 8px 32px #0008',
          transition: 'border-color 0.2s',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignSelf: 'stretch',
            borderRadius: 8,
            overflow: 'hidden',
            border: '1px solid #334155',
            flexShrink: 0,
          }}
        >
          {(['hld', 'lld'] as const).map(level => (
            <button
              key={level}
              type="button"
              onClick={() => onDetailLevelChange(level)}
              disabled={loading}
              title={level === 'hld' ? 'High-level architecture' : 'Low-level class diagram'}
              style={{
                border: 'none',
                padding: '0 12px',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0.5,
                cursor: loading ? 'not-allowed' : 'pointer',
                background: detailLevel === level ? '#3b82f6' : 'transparent',
                color: detailLevel === level ? '#fff' : '#94a3b8',
              }}
            >
              {level.toUpperCase()}
            </button>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder={
            detailLevel === 'lld'
              ? 'Describe the component to detail as classes… (Enter to send)'
              : 'Describe your architecture… (Enter to send, Shift+Enter for newline)'
          }
          rows={1}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#f1f5f9',
            fontSize: 14,
            lineHeight: 1.5,
            resize: 'none',
            fontFamily: 'system-ui, sans-serif',
            maxHeight: 160,
            overflowY: 'auto',
            opacity: loading ? 0.5 : 1,
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !value.trim()}
          style={{
            flexShrink: 0,
            width: 36,
            height: 36,
            borderRadius: 8,
            border: 'none',
            background: loading ? '#1e3a5f' : '#3b82f6',
            color: loading ? '#93c5fd' : '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            transition: 'background 0.15s',
          }}
        >
          {loading ? '●' : '↑'}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
