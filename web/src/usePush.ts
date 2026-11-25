import { useCallback, useEffect, useState } from 'react'
import { disablePushForThisDevice, enablePush, getPushState, type PushState } from './push'
import { errorText } from './format'

const DISMISSED_KEY = 'chatme:push-banner-dismissed'

export type PushControl = ReturnType<typeof usePush>

/** Shared notification state for the header switch and the banner. */
export function usePush() {
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1')

  useEffect(() => {
    getPushState()
      .then(setState)
      .catch(() => setState('off'))
  }, [])

  const dismissBanner = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setBannerDismissed(true)
  }, [])

  const turnOn = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setState(await enablePush())
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }, [])

  const turnOff = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await disablePushForThisDevice()
      setState('off')
      dismissBanner()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }, [dismissBanner])

  return { state, busy, error, setError, turnOn, turnOff, bannerDismissed, dismissBanner }
}
