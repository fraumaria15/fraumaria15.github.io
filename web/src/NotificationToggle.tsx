import type { PushControl } from './usePush'

const PUSH_HINTS = {
  'needs-install':
    'Чтобы получать уведомления на iPhone, добавь приложение на экран «Домой»: Поделиться → На экран «Домой», и открой его оттуда',
  denied: 'Уведомления запрещены. Разреши их в настройках телефона или браузера для этого сайта',
} as const

function BellIcon({ off }: { off: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  )
}

/** Bell + switch in the app header: turn push notifications on/off for this device. */
export function NotificationToggle({ push }: { push: PushControl }) {
  const { state, busy, turnOn, turnOff } = push
  if (state === 'loading' || state === 'unsupported') return null

  const on = state === 'on'
  const blocked = state === 'denied' || state === 'needs-install'
  const label = on ? 'Уведомления включены' : 'Уведомления выключены'

  function toggle() {
    if (busy) return
    if (blocked) {
      window.alert(PUSH_HINTS[state as keyof typeof PUSH_HINTS])
      return
    }
    if (on) turnOff()
    else turnOn()
  }

  return (
    <div className={`notif-toggle ${on ? 'on' : ''}`} title={label}>
      <BellIcon off={!on} />
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`switch ${on ? 'on' : ''} ${blocked ? 'blocked' : ''}`}
        onClick={toggle}
        disabled={busy}
      >
        <span className="knob" />
      </button>
    </div>
  )
}
