-- =====================================================================
-- Messenger schema for Supabase
-- Run once in Supabase Dashboard -> SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,32}$'),
  display_name text not null check (char_length(display_name) between 1 and 64),
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create table public.invites (
  code       text primary key,
  created_by uuid references auth.users (id) on delete set null,
  used_by    uuid references auth.users (id) on delete set null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create table public.chats (
  id         uuid primary key default gen_random_uuid(),
  is_group   boolean not null,
  title      text check (title is null or char_length(title) between 1 and 100),
  -- for direct chats only: '<smaller uuid>:<bigger uuid>', guarantees one DM per pair
  dm_key     text unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (is_group and dm_key is null and title is not null)
    or (not is_group and dm_key is not null)
  )
);

create table public.chat_members (
  chat_id      uuid not null references public.chats (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('admin', 'member')),
  joined_at    timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create index chat_members_user_idx on public.chat_members (user_id);

create table public.messages (
  id         bigint generated always as identity primary key,
  chat_id    uuid not null references public.chats (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index messages_chat_created_idx on public.messages (chat_id, created_at desc);

-- ---------------------------------------------------------------------
-- Helper functions for RLS (security definer avoids recursive policies)
-- ---------------------------------------------------------------------

create or replace function public.is_chat_member(p_chat uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.chat_members
    where chat_id = p_chat and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_admin(p_chat uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_members m
    join public.chats c on c.id = m.chat_id
    where m.chat_id = p_chat
      and m.user_id = auth.uid()
      and m.role = 'admin'
      and c.is_group
  );
$$;

create or replace function public.is_group(p_chat uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select is_group from public.chats where id = p_chat), false);
$$;

-- ---------------------------------------------------------------------
-- Table privileges (explicit: works even when the project does not
-- grant API access to new tables automatically). Anonymous users get nothing.
-- RLS policies below further restrict which rows are visible.
-- ---------------------------------------------------------------------

revoke all on public.profiles, public.invites, public.chats,
              public.chat_members, public.messages
  from anon, authenticated;

grant select                                   on public.profiles     to authenticated;
grant update (username, display_name, avatar_url) on public.profiles  to authenticated;
grant select                                   on public.invites      to authenticated;
grant select                                   on public.chats        to authenticated;
grant update (title)                           on public.chats        to authenticated;
grant select, delete                           on public.chat_members to authenticated;
grant insert (chat_id, user_id)                on public.chat_members to authenticated;
grant select, delete                           on public.messages     to authenticated;
grant insert (chat_id, body)                   on public.messages     to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.profiles     enable row level security;
alter table public.invites      enable row level security;
alter table public.chats        enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages     enable row level security;

-- profiles: closed friends group, every signed-in user sees everyone
create policy "profiles: read all" on public.profiles
  for select to authenticated using (true);

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- invites: user sees invites they created (creation goes through create_invite())
create policy "invites: read own" on public.invites
  for select to authenticated using (created_by = auth.uid());

-- chats: visible only to members; created only via functions below
create policy "chats: read if member" on public.chats
  for select to authenticated using (public.is_chat_member(id));

create policy "chats: group admin updates" on public.chats
  for update to authenticated
  using (public.is_group_admin(id)) with check (public.is_group_admin(id));


-- chat_members
create policy "members: read if member" on public.chat_members
  for select to authenticated using (public.is_chat_member(chat_id));

create policy "members: group admin adds" on public.chat_members
  for insert to authenticated
  with check (public.is_group_admin(chat_id) and role = 'member');

create policy "members: leave group or admin removes" on public.chat_members
  for delete to authenticated
  using (
    public.is_group(chat_id)
    and (user_id = auth.uid() or public.is_group_admin(chat_id))
  );

-- messages
create policy "messages: read if member" on public.messages
  for select to authenticated using (public.is_chat_member(chat_id));

create policy "messages: send if member" on public.messages
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_chat_member(chat_id));

create policy "messages: delete own" on public.messages
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Signup gated by invite code
-- Client signs up with options.data = { invite_code, username, display_name }
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := new.raw_user_meta_data ->> 'invite_code';
  v_username text := lower(new.raw_user_meta_data ->> 'username');
begin
  update public.invites
     set used_by = new.id, used_at = now()
   where code = v_code and used_by is null;

  if not found then
    raise exception 'Invalid or already used invite code';
  end if;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    v_username,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), v_username)
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- RPC functions (call from client via supabase.rpc(...))
-- ---------------------------------------------------------------------

-- Any user can create an invite for a new friend
create or replace function public.create_invite()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.invites (code, created_by) values (v_code, auth.uid());
  return v_code;
end;
$$;

-- Open (or create) the direct chat between current user and another user
create or replace function public.get_or_create_dm(p_other uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_chat uuid;
begin
  if v_me is null then
    raise exception 'Not authenticated';
  end if;
  if p_other is null or p_other = v_me then
    raise exception 'Invalid user';
  end if;
  if not exists (select 1 from public.profiles where id = p_other) then
    raise exception 'User not found';
  end if;

  v_key := least(v_me, p_other)::text || ':' || greatest(v_me, p_other)::text;

  insert into public.chats (is_group, dm_key, created_by)
  values (false, v_key, v_me)
  on conflict (dm_key) do nothing;

  select id into v_chat from public.chats where dm_key = v_key;

  insert into public.chat_members (chat_id, user_id)
  values (v_chat, v_me), (v_chat, p_other)
  on conflict do nothing;

  return v_chat;
end;
$$;

-- Create a group chat; creator becomes admin
create or replace function public.create_group(p_title text, p_member_ids uuid[])
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_chat uuid;
begin
  if v_me is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.chats (is_group, title, created_by)
  values (true, p_title, v_me)
  returning id into v_chat;

  insert into public.chat_members (chat_id, user_id, role)
  values (v_chat, v_me, 'admin');

  insert into public.chat_members (chat_id, user_id, role)
  select v_chat, p.id, 'member'
  from public.profiles p
  where p.id = any (coalesce(p_member_ids, '{}'))
    and p.id <> v_me
  on conflict do nothing;

  return v_chat;
end;
$$;

-- Mark chat as read for current user
create or replace function public.mark_read(p_chat uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.chat_members
     set last_read_at = now()
   where chat_id = p_chat and user_id = auth.uid();
$$;

-- Nobody anonymous calls RPCs
revoke execute on function public.create_invite()                 from anon, public;
revoke execute on function public.get_or_create_dm(uuid)          from anon, public;
revoke execute on function public.create_group(text, uuid[])      from anon, public;
revoke execute on function public.mark_read(uuid)                 from anon, public;
grant  execute on function public.create_invite()                 to authenticated;
grant  execute on function public.get_or_create_dm(uuid)          to authenticated;
grant  execute on function public.create_group(text, uuid[])      to authenticated;
grant  execute on function public.mark_read(uuid)                 to authenticated;

-- ---------------------------------------------------------------------
-- Realtime: new messages pushed to subscribed clients (RLS applies)
-- ---------------------------------------------------------------------

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.chat_members;

-- ---------------------------------------------------------------------
-- Bootstrap: first invite for yourself (run separately, copy the code)
-- ---------------------------------------------------------------------
-- insert into public.invites (code) values ('my-first-invite') returning code;
