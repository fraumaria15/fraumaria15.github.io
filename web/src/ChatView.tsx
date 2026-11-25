import { useEffect, useRef, useState } from 'react'
import { formatTime } from './format'
import { Footer } from './Footer'
import type { Message, Profile } from './types'

type Props = {
  title: string
  subtitle: string | null
  isGroup: boolean
  messages: Message[]
  loading: boolean
  profiles: Map<string, Profile>
  userId: string
  onSend: (body: string) => Promise<boolean>
  onBack: () => void
  onContactDeveloper?: () => void
}

export function ChatView({
  title,
  subtitle,
  isGroup,
  messages,
  loading,
  profiles,
  userId,
  onSend,
  onBack,
  onContactDeveloper,
}: Props) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  async function send() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    const ok = await onSend(body)
    setSending(false)
    if (ok) setText('')
  }

  return (
    <section className="chat">
      <header className="chat-header">
        <button className="icon back" onClick={onBack} aria-label="Назад">
          ←
        </button>
        <div>
          <div className="chat-title">{title}</div>
          {subtitle && <div className="muted small">{subtitle}</div>}
        </div>
      </header>

      <div className="messages">
        {loading && <div className="muted center-text">Загрузка…</div>}
        {!loading && messages.length === 0 && <div className="muted center-text">Сообщений пока нет</div>}
        {messages.map((m, i) => {
          const mine = m.user_id === userId
          const showAuthor = isGroup && !mine && messages[i - 1]?.user_id !== m.user_id
          return (
            <div key={m.id} className={`msg ${mine ? 'mine' : ''}`}>
              {showAuthor && <div className="author">{profiles.get(m.user_id)?.display_name ?? '…'}</div>}
              <div className="bubble">
                {m.body}
                <span className="time">{formatTime(m.created_at)}</span>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder="Сообщение"
        />
        <button className="primary" disabled={!text.trim() || sending}>
          Отправить
        </button>
      </form>
      <Footer onContactDeveloper={onContactDeveloper} />
    </section>
  )
}
