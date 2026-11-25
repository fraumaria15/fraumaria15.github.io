import { useEffect, useState } from 'react'
import { enablePush, getPushState, type PushState } from './push'
import { errorText } from './format'

export function PushBanner() {
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    getPushState()
      .then(setState)
      .catch(() => setState('off'))
  }, [])

  async function enable() {
    setBusy(true)
    setError(null)
    try {
      setState(await enablePush())
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  if (hidden || state === 'loading' || state === 'on' || state === 'unsupported') return null

  return (
    <div className="banner">
      {state === 'off' && (
        <>
          <span>Включи уведомления, чтобы не пропускать сообщения</span>
          <button className="primary" onClick={enable} disabled={busy}>
            Включить
          </button>
        </>
      )}
      {state === 'needs-install' && (
        <span>
          Чтобы получать уведомления на iPhone, добавь приложение на экран «Домой»: Поделиться → На экран «Домой», и
          открой его оттуда
        </span>
      )}
      {state === 'denied' && <span>Уведомления запрещены. Разреши их в настройках телефона или браузера для этого сайта</span>}
      {error && <span className="error">{error}</span>}
      <button className="icon" onClick={() => setHidden(true)} aria-label="Скрыть">
        ×
      </button>
    </div>
  )
}
