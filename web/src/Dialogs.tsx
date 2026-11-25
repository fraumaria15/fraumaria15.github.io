import { useState, type FormEvent } from 'react'
import { Modal } from './Modal'
import { supabase } from './supabase'
import { errorText } from './format'
import type { Profile } from './types'

type Common = { onClose: () => void }

export function NewDmDialog({ people, onPick, onClose }: Common & { people: Profile[]; onPick: (id: string) => void }) {
  return (
    <Modal title="Написать" onClose={onClose}>
      {people.length === 0 && <p className="muted">Пока никого нет. Пригласи друзей.</p>}
      <ul className="people">
        {people.map((p) => (
          <li key={p.id}>
            <button onClick={() => onPick(p.id)}>
              <span className="avatar">{p.display_name[0]?.toUpperCase()}</span>
              <span>
                {p.display_name} <span className="muted">@{p.username}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

export function NewGroupDialog({
  people,
  onCreate,
  onClose,
}: Common & { people: Profile[]; onCreate: (title: string, ids: string[]) => Promise<void> }) {
  const [title, setTitle] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onCreate(title.trim(), [...picked])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Новая группа" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <label>
          Название
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={100} />
        </label>
        <ul className="people">
          {people.map((p) => (
            <li key={p.id}>
              <label className="check">
                <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                {p.display_name} <span className="muted">@{p.username}</span>
              </label>
            </li>
          ))}
        </ul>
        <button className="primary" disabled={busy || !title.trim()}>
          Создать
        </button>
      </form>
    </Modal>
  )
}

export function InviteDialog({ onClose }: Common) {
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function create() {
    setError(null)
    const { data, error } = await supabase.rpc('create_invite')
    if (error) return setError(errorText(error))
    setLink(`${window.location.origin}/?invite=${data as string}`)
    setCopied(false)
  }

  async function copy() {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
  }

  return (
    <Modal title="Пригласить друга" onClose={onClose}>
      <div className="stack">
        <p className="muted">Ссылка одноразовая: по ней может зарегистрироваться один человек.</p>
        {link ? (
          <>
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
            <button className="primary" onClick={copy}>
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </>
        ) : (
          <button className="primary" onClick={create}>
            Создать ссылку
          </button>
        )}
        {error && <div className="error">{error}</div>}
      </div>
    </Modal>
  )
}
