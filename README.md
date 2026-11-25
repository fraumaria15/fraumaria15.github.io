# chatme

Small private messenger for a group of friends: invite-only signup, direct and group chats, realtime messages.

Stack: React + Vite + TypeScript, Supabase (Postgres, Auth, Realtime).

## Setup

1. Create a Supabase project, run `supabase/schema.sql` in SQL Editor.
2. Create the first invite:
   ```sql
   insert into public.invites (code) values ('my-first-invite');
   ```
3. Authentication → Sign In / Providers: turn off "Confirm email" (optional).
4. Frontend:
   ```sh
   cd web
   cp .env.example .env   # fill VITE_SUPABASE_URL and VITE_SUPABASE_KEY (anon / publishable key)
   npm install
   npm run dev
   ```

Never put the `service_role` / secret key into the frontend or the repo.
