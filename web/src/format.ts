export function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return time
  return `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${time}`
}

export function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String(err.message) : String(err)
  if (msg.includes('Invalid login credentials')) return 'Неверная почта или пароль'
  if (msg.includes('Database error saving new user'))
    return 'Инвайт-код неверный или уже использован, либо этот ник уже занят'
  if (msg.includes('User already registered')) return 'Эта почта уже зарегистрирована'
  if (msg.includes('Password should be')) return 'Пароль слишком короткий'
  if (msg.includes('Failed to fetch')) return 'Нет связи с сервером. Проверь интернет'
  return msg
}

export function timestamp(iso: string): number {
  return new Date(iso).getTime()
}
