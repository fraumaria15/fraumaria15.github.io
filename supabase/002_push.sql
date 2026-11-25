-- =====================================================================
-- Push notifications. Run once in Supabase SQL Editor (after schema.sql).
-- Then run the vault.create_secret(...) line from secrets.local.md.
-- =====================================================================

create extension if not exists pg_net;

-- One row per device/browser that allowed notifications
create table public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Clients never touch this table directly, only through the functions below
revoke all on public.push_subscriptions from anon, authenticated;

-- The send-push Edge Function uses the service role
grant select, delete on public.push_subscriptions to service_role;
grant select on public.profiles, public.chats, public.chat_members, public.messages to service_role;

-- Save (or move to the current user) this device's subscription
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh  = excluded.p256dh,
        auth    = excluded.auth;
end;
$$;

-- Remove this device's subscription (on logout)
create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke execute on function public.save_push_subscription(text, text, text) from anon, public;
revoke execute on function public.delete_push_subscription(text)           from anon, public;
grant  execute on function public.save_push_subscription(text, text, text) to authenticated;
grant  execute on function public.delete_push_subscription(text)           to authenticated;

-- On every new message, ask the send-push Edge Function to notify the chat.
-- pg_net is async: sending a message never waits for push delivery.
-- Any failure here is swallowed so messaging keeps working without push.
create or replace function public.notify_new_message()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'push_webhook_secret';

  if v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := 'https://mwgefedebgzvmwoccnxe.supabase.co/functions/v1/send-push',
    body    := jsonb_build_object('message_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret)
  );
  return new;
exception when others then
  return new;
end;
$$;

create trigger messages_send_push
  after insert on public.messages
  for each row execute function public.notify_new_message();
