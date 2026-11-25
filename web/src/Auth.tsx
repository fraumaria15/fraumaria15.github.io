import { useState, type FormEvent } from 'react'
import { supabase } from './supabase'
import { errorText } from './format'

const inviteFromUrl = new URLSearchParams(window.location.search).get('invite') ?? ''

export function Auth() {
  const [mode, setMode] = useState<'login' | 'register'>(inviteFromUrl ? 'register' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [invite, setInvite] = useState(inviteFromUrl)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        return
      }

      const uname = username.trim().toLowerCase()
      if (!/^[a-z0-9_]{3,32}$/.test(uname)) {
        throw new Error('Ник: 3–32 символа, только латиница, цифры и _')
      }
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            invite_code: invite.trim(),
            username: uname,
            display_name: displayName.trim() || uname,
          },
        },
      })
      if (error) throw error
      if (!data.session) setInfo('Проверь почту и подтверди адрес, потом войди')
      else window.history.replaceState(null, '', window.location.pathname)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center">
      <form className="card auth" onSubmit={submit}>
        <h1>chatme</h1>
        <div className="tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Вход
          </button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            Регистрация
          </button>
        </div>

        {mode === 'register' && (
          <>
            <label>
              Инвайт-код
              <input value={invite} onChange={(e) => setInvite(e.target.value)} required autoComplete="off" />
            </label>
            <label>
              Ник (латиница)
              <input value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="masha_k" />
            </label>
            <label>
              Имя для друзей
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Маша" />
            </label>
          </>
        )}

        <label>
          Почта
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>

        {error && <div className="error">{error}</div>}
        {info && <div className="info">{info}</div>}

        <button className="primary" disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
        </button>
      </form>
    </div>
  )
}
