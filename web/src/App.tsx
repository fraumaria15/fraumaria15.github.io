import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configError, supabase } from './supabase'
import { Auth } from './Auth'
import { Messenger } from './Messenger'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (configError) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (configError) return <div className="center error">{configError}</div>
  if (loading) return <div className="center muted">Загрузка…</div>
  if (!session) return <Auth />
  return <Messenger key={session.user.id} userId={session.user.id} />
}
