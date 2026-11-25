import { useEffect, type ReactNode } from 'react'

type Props = { title: string; onClose: () => void; children: ReactNode }

export function Modal({ title, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button className="icon" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}
