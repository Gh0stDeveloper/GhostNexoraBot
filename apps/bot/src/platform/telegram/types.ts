export type TelegramUser = {
  id: number
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
}

export type TelegramChat = {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
  username?: string
}

export type TelegramPhotoSize = {
  file_id: string
  file_unique_id?: string
  width?: number
  height?: number
  file_size?: number
}

export type TelegramFileRef = {
  file_id: string
  file_unique_id?: string
  file_name?: string
  mime_type?: string
  file_size?: number
}

export type TelegramMessage = {
  message_id: number
  date?: number
  chat: TelegramChat
  from?: TelegramUser
  sender_chat?: TelegramChat
  text?: string
  caption?: string
  photo?: TelegramPhotoSize[]
  video?: TelegramFileRef
  audio?: TelegramFileRef
  voice?: TelegramFileRef
  document?: TelegramFileRef
  sticker?: TelegramFileRef
  reply_to_message?: TelegramMessage
  has_protected_content?: boolean
}

export type TelegramCallbackQuery = {
  id: string
  from: TelegramUser
  message?: TelegramMessage
  inline_message_id?: string
  data?: string
}

export type TelegramUpdate = {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
  channel_post?: TelegramMessage
  edited_channel_post?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

export type TelegramApiResponse<T> = {
  ok: boolean
  result?: T
  error_code?: number
  description?: string
  parameters?: {
    retry_after?: number
    migrate_to_chat_id?: number
  }
}

export type TelegramBotIdentity = TelegramUser & {
  can_join_groups?: boolean
  can_read_all_group_messages?: boolean
  supports_inline_queries?: boolean
}

export type TelegramWebhookInfo = {
  url: string
  has_custom_certificate?: boolean
  pending_update_count?: number
  last_error_date?: number
  last_error_message?: string
  max_connections?: number
  allowed_updates?: string[]
}

export type TelegramChatMember = {
  status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked'
  user: TelegramUser
}

export type TelegramFile = {
  file_id: string
  file_unique_id?: string
  file_size?: number
  file_path?: string
}

export type TelegramInlineButton = {
  text: string
  callback_data?: string
  url?: string
}

export type TelegramInlineKeyboard = {
  inline_keyboard: TelegramInlineButton[][]
}
