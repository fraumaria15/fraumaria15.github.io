import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import { errorText, formatTime, timestamp } from './format'
import type { ChatItem, Member, Message, Profile } from './types'
import { ChatView } from './ChatView'
import { InviteDialog, NewDmDialog, NewGroupDialog } from './Dialogs'
import { NotificationToggle } from './NotificationToggle'
import { usePush } from './usePush'
import { disablePushForThisDevice } from './push'
import { Footer } from './Footer'

// Username (ник) of the developer account for the "Написать разработчику" link
const DEVELOPER_USERNAME = 'mashinka'

type Props = { userId: string }
type Dialog = 'dm' | 'group' | 'invite' | null

const PAGE = 200

function activity(c: ChatItem): number {
  return timestamp(c.last?.created_at ?? c.created_at)
}

function sortChats(list: ChatItem[]): ChatItem[] {
  return [...list].sort((a, b) => activity(b) - activity(a))
}

export function Messenger({ userId }: Props) {
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map())
  const [chats, setChats] = useState<ChatItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [error, setError] = useState<string | null>(null)

  const push = usePush()

  const activeRef = useRef<string | null>(null)
  const profilesRef = useRef(profiles)
  useEffect(() => {
    profilesRef.current = profiles
  }, [profiles])

  const loadProfiles = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('id, username, display_name, avatar_url')
    if (error) return setError(errorText(error))
    setProfiles(new Map((data as Profile[]).map((p) => [p.id, p])))
  }, [])

  const loadChats = useCallback(async () => {
    const { data, error } = await supabase
      .from('chats')
      .select('id, is_group, title, created_at, chat_members(user_id, last_read_at)')
    if (error) return setError(errorText(error))

    type Row = { id: string; is_group: boolean; title: string | null; created_at: string; chat_members: Member[] }
    const rows = data as Row[]

    const items = await Promise.all(
      rows.map(async (c): Promise<ChatItem> => {
        const me = c.chat_members.find((m) => m.user_id === userId)
        const [lastRes, unreadRes] = await Promise.all([
          supabase
            .from('messages')
            .select('id, chat_id, user_id, body, created_at')
            .eq('chat_id', c.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('chat_id', c.id)
            .neq('user_id', userId)
            .gt('created_at', me?.last_read_at ?? c.created_at),
        ])
        return {
          id: c.id,
          is_group: c.is_group,
          title: c.title,
          created_at: c.created_at,
          members: c.chat_members,
          last: (lastRes.data as Message | null) ?? null,
          unread: c.id === activeRef.current ? 0 : unreadRes.count ?? 0,
        }
      }),
    )
    setChats(sortChats(items))
  }, [userId])

  useEffect(() => {
    loadProfiles()
    loadChats()
  }, [loadProfiles, loadChats])

  // Realtime: new messages in any of my chats + me being added to a chat
  useEffect(() => {
    function onMessage(m: Message) {
      if (!profilesRef.current.has(m.user_id)) loadProfiles()

      if (m.chat_id === activeRef.current) {
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
        if (m.user_id !== userId) supabase.rpc('mark_read', { p_chat: m.chat_id })
      }

      setChats((prev) => {
        const chat = prev.find((c) => c.id === m.chat_id)
        if (!chat) {
          loadChats()
          return prev
        }
        const isUnread = m.user_id !== userId && m.chat_id !== activeRef.current
        const updated = { ...chat, last: m, unread: chat.unread + (isUnread ? 1 : 0) }
        return sortChats(prev.map((c) => (c.id === m.chat_id ? updated : c)))
      })
    }

    const channel = supabase
      .channel(`inbox-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) =>
        onMessage(payload.new as Message),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_members', filter: `user_id=eq.${userId}` },
        () => loadChats(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, loadChats, loadProfiles])

  const openChat = useCallback(async (chatId: string) => {
    activeRef.current = chatId
    setActiveId(chatId)
    setMessages([])
    setLoadingMessages(true)
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, unread: 0 } : c)))

    const { data, error } = await supabase
      .from('messages')
      .select('id, chat_id, user_id, body, created_at')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(PAGE)

    if (activeRef.current !== chatId) return
    setLoadingMessages(false)
    if (error) return setError(errorText(error))

    const loaded = (data as Message[]).reverse()
    // keep realtime messages that arrived while loading
    setMessages((prev) => {
      const ids = new Set(loaded.map((m) => m.id))
      return [...loaded, ...prev.filter((m) => !ids.has(m.id))]
    })
    supabase.rpc('mark_read', { p_chat: chatId })
  }, [])

  // Open the chat from a notification: ?chat=<id> on launch, or a message from the service worker
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('chat')
    if (fromUrl) {
      window.history.replaceState(null, '', window.location.pathname)
      openChat(fromUrl)
    }
    if (!('serviceWorker' in navigator)) return
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type === 'open-chat' && typeof e.data.chatId === 'string') openChat(e.data.chatId)
    }
    navigator.serviceWorker.addEventListener('message', onSwMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onSwMessage)
  }, [openChat])

  async function logout() {
    try {
      await disablePushForThisDevice()
    } catch {
      // still log out even if push cleanup fails
    }
    await supabase.auth.signOut()
  }

  function closeChat() {
    activeRef.current = null
    setActiveId(null)
  }

  async function send(body: string): Promise<boolean> {
    if (!activeId) return false
    const { data, error } = await supabase
      .from('messages')
      .insert({ chat_id: activeId, body })
      .select('id, chat_id, user_id, body, created_at')
      .single()
    if (error) {
      setError(errorText(error))
      return false
    }
    const m = data as Message
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
    setChats((prev) => sortChats(prev.map((c) => (c.id === m.chat_id ? { ...c, last: m } : c))))
    return true
  }

  async function startDm(otherId: string) {
    const { data, error } = await supabase.rpc('get_or_create_dm', { p_other: otherId })
    if (error) return setError(errorText(error))
    setDialog(null)
    await loadChats()
    openChat(data as string)
  }

  async function createGroup(title: string, ids: string[]) {
    const { data, error } = await supabase.rpc('create_group', { p_title: title, p_member_ids: ids })
    if (error) return setError(errorText(error))
    setDialog(null)
    await loadChats()
    openChat(data as string)
  }

  const chatTitle = useCallback(
    (c: ChatItem): string => {
      if (c.is_group) return c.title ?? 'Группа'
      const other = c.members.find((m) => m.user_id !== userId)
      return (other && profiles.get(other.user_id)?.display_name) || 'Чат'
    },
    [profiles, userId],
  )

  const others = useMemo(
    () => [...profiles.values()].filter((p) => p.id !== userId).sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [profiles, userId],
  )

  const me = profiles.get(userId)

  const developer = DEVELOPER_USERNAME
    ? [...profiles.values()].find((p) => p.username === DEVELOPER_USERNAME)
    : undefined
  const contactDeveloper = developer && developer.id !== userId ? () => startDm(developer.id) : undefined
  const active = chats.find((c) => c.id === activeId) ?? null

  function preview(c: ChatItem): string {
    if (!c.last) return 'Нет сообщений'
    const author = c.last.user_id === userId ? 'Вы: ' : c.is_group ? `${profiles.get(c.last.user_id)?.display_name ?? ''}: ` : ''
    return author + c.last.body
  }

  return (
    <div className={`layout ${active ? 'has-active' : ''}`}>
      <aside className="sidebar">
        <header className="sidebar-header">
          <div>
            <div className="chat-title">{me?.display_name ?? '…'}</div>
            {me && <div className="muted small">@{me.username}</div>}
          </div>
          <div className="header-actions">
            <NotificationToggle push={push} />
            <button className="link" onClick={logout}>
              Выйти
            </button>
          </div>
        </header>

        <div className="actions">
          <button onClick={() => setDialog('dm')}>Написать</button>
          <button onClick={() => setDialog('group')}>Группа</button>
          <button onClick={() => setDialog('invite')}>Пригласить</button>
        </div>

        {push.error && (
          <div className="error dismissible" onClick={() => push.setError(null)} title="Скрыть">
            {push.error}
          </div>
        )}

        {error && (
          <div className="error dismissible" onClick={() => setError(null)} title="Скрыть">
            {error}
          </div>
        )}

        <ul className="chat-list">
          {chats.length === 0 && <li className="muted pad">Чатов пока нет. Нажми «Написать».</li>}
          {chats.map((c) => (
            <li key={c.id}>
              <button className={c.id === activeId ? 'active' : ''} onClick={() => openChat(c.id)}>
                <span className="avatar">{chatTitle(c)[0]?.toUpperCase()}</span>
                <span className="chat-meta">
                  <span className="row">
                    <span className="name">{chatTitle(c)}</span>
                    {c.last && <span className="muted small">{formatTime(c.last.created_at)}</span>}
                  </span>
                  <span className="row">
                    <span className="muted preview">{preview(c)}</span>
                    {c.unread > 0 && <span className="badge">{c.unread}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Footer onContactDeveloper={contactDeveloper} />
      </aside>

      <main className="main">
        {active ? (
          <ChatView
            key={active.id}
            title={chatTitle(active)}
            subtitle={
              active.is_group
                ? active.members.map((m) => profiles.get(m.user_id)?.display_name ?? '…').join(', ')
                : null
            }
            isGroup={active.is_group}
            messages={messages}
            loading={loadingMessages}
            profiles={profiles}
            userId={userId}
            onSend={send}
            onBack={closeChat}
            onContactDeveloper={contactDeveloper}
          />
        ) : (
          <div className="center muted">Выбери чат</div>
        )}
      </main>

      {dialog === 'dm' && <NewDmDialog people={others} onPick={startDm} onClose={() => setDialog(null)} />}
      {dialog === 'group' && <NewGroupDialog people={others} onCreate={createGroup} onClose={() => setDialog(null)} />}
      {dialog === 'invite' && <InviteDialog onClose={() => setDialog(null)} />}
    </div>
  )
}
