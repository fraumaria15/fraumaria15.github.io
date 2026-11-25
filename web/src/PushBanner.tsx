import type { PushControl } from './usePush'

export const PUSH_HINTS = {
  'needs-install':
    'Чтобы получать уведомления на iPhone, добавь приложение на экран «Домой»: Поделиться → На экран «Домой», и открой его оттуда',
  denied: 'Уведомления запрещены. Разреши их в настройках телефона или браузера для этого сайта',
} as const

/** One-time prompt for people who have not decided about notifications yet. */
export function PushBanner({ push }: { push: PushControl }) {
  const { state, busy, error, turnOn, bannerDismissed, dismissBanner } = push

  const visible = state === 'off' || state === 'needs-install' || state === 'denied'
  if (bannerDismissed || !visible) return error ? <div className="error dismissible">{error}</div> : null

  return (
    <div className="banner">
      {state === 'off' && (
        <>
          <span>Включи уведомления, чтобы не пропускать сообщения</span>
          <button className="primary" onClick={turnOn} disabled={busy}>
            Включить
          </button>
        </>
      )}
      {state === 'needs-install' && <span>{PUSH_HINTS['needs-install']}</span>}
      {state === 'denied' && <span>{PUSH_HINTS.denied}</span>}
      {error && <span className="error">{error}</span>}
      <button className="icon" onClick={dismissBanner} aria-label="Скрыть">
        ×
      </button>
    </div>
  )
}
