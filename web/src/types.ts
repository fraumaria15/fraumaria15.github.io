export type Profile = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
}

export type Message = {
  id: number
  chat_id: string
  user_id: string
  body: string
  created_at: string
}

export type Member = {
  user_id: string
  last_read_at: string
}

export type ChatItem = {
  id: string
  is_group: boolean
  title: string | null
  created_at: string
  members: Member[]
  last: Message | null
  unread: number
}
