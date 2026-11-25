import { supabase } from './supabase'

// Public VAPID key (safe to ship in the app). Private key lives only in Supabase secrets.
const VAPID_PUBLIC_KEY =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ||
  'BBvZNWc553M4qv7PXxHxf_o_RJdsFvsAp-q38J49LmXmU3A9D4iMqP5UskqFGYtsMw3auiODhi-LDHJ2TAOLLdE'

export type PushState = 'loading' | 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

async function save(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
  })
  if (error) throw error
}

/** Current state; if already allowed, re-links this device to the logged-in user. */
export async function getPushState(): Promise<PushState> {
  if (!supported()) return isIOS && !isStandalone ? 'needs-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await registration()
  if (!reg) return 'unsupported' // no service worker (e.g. local dev)
  const sub = await reg.pushManager.getSubscription()
  if (Notification.permission === 'granted' && sub) {
    await save(sub)
    return 'on'
  }
  return 'off'
}

/** Must be called from a click (iOS requires a user gesture). */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission()
  if (permission === 'denied') return 'denied'
  if (permission !== 'granted') return 'off'

  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))
  await save(sub)
  return 'on'
}

/** On logout: stop sending this user's notifications to this device. */
export async function disablePushForThisDevice(): Promise<void> {
  if (!supported()) return
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
  await sub.unsubscribe()
}
