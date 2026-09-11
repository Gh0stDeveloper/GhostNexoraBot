export type DiscordSnowflake = string

export interface DiscordUser {
  id: DiscordSnowflake
  username: string
  discriminator?: string
  global_name?: string | null
  avatar?: string | null
  bot?: boolean
}

export interface DiscordGuildMember {
  user?: DiscordUser
  nick?: string | null
  roles?: DiscordSnowflake[]
}

export interface DiscordAttachment {
  id: DiscordSnowflake
  filename: string
  description?: string | null
  content_type?: string
  size: number
  url: string
  proxy_url?: string
  width?: number | null
  height?: number | null
}

export interface DiscordMessageReference {
  type?: number
  message_id?: DiscordSnowflake
  channel_id?: DiscordSnowflake
  guild_id?: DiscordSnowflake
  fail_if_not_exists?: boolean
}

export interface DiscordMessage {
  id: DiscordSnowflake
  channel_id: DiscordSnowflake
  guild_id?: DiscordSnowflake
  author: DiscordUser
  member?: DiscordGuildMember
  content: string
  timestamp?: string
  edited_timestamp?: string | null
  attachments: DiscordAttachment[]
  mentions?: DiscordUser[]
  message_reference?: DiscordMessageReference
  referenced_message?: DiscordMessage | null
  components?: DiscordMessageComponent[]
}

export interface DiscordReady {
  v: number
  user: DiscordUser
  guilds: Array<{ id: DiscordSnowflake; unavailable?: boolean }>
  session_id: string
  resume_gateway_url: string
  application: { id: DiscordSnowflake; flags?: number }
}

export interface DiscordGatewayBot {
  url: string
  shards: number
  session_start_limit: {
    total: number
    remaining: number
    reset_after: number
    max_concurrency: number
  }
}

export interface DiscordGatewayPayload<T = unknown> {
  op: number
  d: T
  s?: number | null
  t?: string | null
}

export interface DiscordApplicationCommandOption {
  name: string
  value?: string | number | boolean
  type: number
  options?: DiscordApplicationCommandOption[]
}

export interface DiscordApplicationCommandData {
  id?: DiscordSnowflake
  name: string
  type?: number
  options?: DiscordApplicationCommandOption[]
}

export interface DiscordComponentInteractionData {
  custom_id: string
  component_type: number
}

export interface DiscordInteraction {
  id: DiscordSnowflake
  application_id: DiscordSnowflake
  type: number
  data?: DiscordApplicationCommandData | DiscordComponentInteractionData
  guild_id?: DiscordSnowflake
  channel_id?: DiscordSnowflake
  member?: DiscordGuildMember
  user?: DiscordUser
  token: string
  version: number
  message?: DiscordMessage
  /** BCP-47/Discord locale hint for the invoking user, for example es-ES or en-US. */
  locale?: string
  /** Guild locale configured by Discord. User locale keeps higher precedence. */
  guild_locale?: string
}

export type DiscordButtonComponent =
  | { type: 2; style: 1 | 2 | 3 | 4; label: string; custom_id: string; disabled?: boolean }
  | { type: 2; style: 5; label: string; url: string; disabled?: boolean }

export interface DiscordActionRow {
  type: 1
  components: DiscordButtonComponent[]
}

export type DiscordMessageComponent = DiscordActionRow | DiscordButtonComponent

export interface DiscordEmbed {
  title?: string
  description?: string
  url?: string
  image?: { url: string }
  thumbnail?: { url: string }
  footer?: { text: string }
}

export interface DiscordCreateMessageBody {
  content?: string
  embeds?: DiscordEmbed[]
  components?: DiscordActionRow[]
  allowed_mentions?: { parse?: string[]; users?: string[]; roles?: string[]; replied_user?: boolean }
  message_reference?: DiscordMessageReference
  attachments?: Array<{ id: number; filename: string; description?: string }>
}

export interface DiscordApplicationCommandDefinition {
  name: string
  description: string
  description_localizations?: Record<string, string>
  type?: 1
  dm_permission?: boolean
  options?: Array<{
    type: 3
    name: string
    description: string
    description_localizations?: Record<string, string>
    required?: boolean
    max_length?: number
  }>
}

export interface DiscordRestErrorBody {
  message?: string
  code?: number
  retry_after?: number
  global?: boolean
}

export interface DiscordGatewaySession {
  sessionId: string
  resumeGatewayUrl: string
  sequence: number | null
}
