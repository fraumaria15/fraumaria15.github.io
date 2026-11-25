// Supabase Edge Function: send-push
// Called by the messages_send_push trigger (supabase/002_push.sql).
// Sends a Web Push notification to every member of the chat except the sender.
//
// Secrets (Edge Functions -> Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT, PUSH_WEBHOOK_SECRET. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// are provided by Supabase automatically.
// "Verify JWT" must be OFF for this function: it checks x-push-secret instead.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const WEBHOOK_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET')

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

Deno.serve(async (req) => {
  if (!WEBHOOK_SECRET || req.headers.get('x-push-secret') !== WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 })
  }

  const { message_id } = await req.json().catch(() => ({}))
  if (!message_id) return new Response('message_id required', { status: 400 })

  const { data: msg, error: msgError } = await supabase
    .from('messages')
    .select('id, chat_id, user_id, body')
    .eq('id', message_id)
    .single()
  if (msgError || !msg) return new Response('message not found', { status: 404 })

  const [chatRes, membersRes, senderRes] = await Promise.all([
    supabase.from('chats').select('is_group, title').eq('id', msg.chat_id).single(),
    supabase.from('chat_members').select('user_id').eq('chat_id', msg.chat_id),
    supabase.from('profiles').select('display_name').eq('id', msg.user_id).single(),
  ])

  const recipients = (membersRes.data ?? []).map((m) => m.user_id).filter((id) => id !== msg.user_id)
  if (recipients.length === 0) return Response.json({ sent: 0 })

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', recipients)
  if (!subs || subs.length === 0) return Response.json({ sent: 0 })

  const senderName = senderRes.data?.display_name ?? 'Новое сообщение'
  const isGroup = chatRes.data?.is_group ?? false
  const payload = JSON.stringify({
    title: isGroup ? chatRes.data?.title ?? 'Группа' : senderName,
    body: truncate(isGroup ? `${senderName}: ${msg.body}` : msg.body, 200),
    chatId: msg.chat_id,
    tag: msg.chat_id,
  })

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
        TTL: 60 * 60 * 24,
        urgency: 'high',
      }),
    ),
  )

  // Subscriptions that the push service says are gone: delete them
  const dead = subs
    .filter((_, i) => {
      const r = results[i]
      const code = r.status === 'rejected' ? (r.reason as { statusCode?: number })?.statusCode : undefined
      return code === 404 || code === 410
    })
    .map((s) => s.id)
  if (dead.length > 0) await supabase.from('push_subscriptions').delete().in('id', dead)

  const sent = results.filter((r) => r.status === 'fulfilled').length
  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => String((r.reason as { statusCode?: number })?.statusCode ?? r.reason))

  return Response.json({ sent, removed: dead.length, failed })
})
