import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined

export const configError =
  !url || !key ? 'Заполни VITE_SUPABASE_URL и VITE_SUPABASE_KEY в файле web/.env и перезапусти npm run dev' : null

export const supabase = createClient(url || 'http://localhost', key || 'missing')
