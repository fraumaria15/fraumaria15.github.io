import { useCallback, useEffect, useState } from 'react'
import { disablePushForThisDevice, enablePush, getPushState, type PushState } from './push'
import { errorText } from './format'

export type PushControl = ReturnType<typeof usePush>

/** Notification state for the header bell switch. */
export function usePush() {
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPushState()
      .then(setState)
      .catch(() => setState('off'))
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
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }, [])

  return { state, busy, error, setError, turnOn, turnOff }
}
