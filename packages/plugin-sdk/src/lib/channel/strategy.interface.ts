import { INotificationDestination } from '@metad/contracts'

/**
 * Channel message payload
 */
export type TChannelPayload = {
  /**
   * Event type
   */
  eventType: string // 'task.created', 'task.completed', 'pr.created', etc.

  /**
   * Event data
   */
  data: Record<string, any>

  /**
   * Target (optional, if not already configured in destination)
   */
  target?: {
    type: 'chat' | 'user' | 'channel'
    id: string
  }

  /**
   * Tenant and organization context
   */
  tenantId: string
  organizationId?: string

  /**
   * Optional: message priority
   */
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}

/**
 * Channel strategy metadata
 */
export type TChannelMeta = {
  /**
   * Strategy type identifier
   */
  type: string // 'lark', 'wecom', 'dingtalk', 'email', 'slack'

  /**
   * Display label
   */
  label: string

  /**
   * Description
   */
  description?: string

  /**
   * Icon
   */
  icon?: string

  /**
   * Configuration JSON Schema
   */
  configSchema?: Record<string, any>

  /**
   * Supported event types
   */
  supportedEvents?: string[]
}

/**
 * Channel send result
 */
export type TChannelSendResult = {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Channel config validation result
 */
export type TChannelValidationResult = {
  valid: boolean
  errors?: string[]
}

/**
 * Channel connection test result
 */
export type TChannelTestResult = {
  success: boolean
  message?: string
}

/**
 * Channel Strategy Interface
 *
 * Implement this interface to create a new channel strategy.
 * The strategy will be automatically registered to ChannelStrategyRegistry
 * via @ChannelStrategy decorator.
 *
 * @example
 * ```typescript
 * @Injectable()
 * @ChannelStrategy('lark')
 * export class LarkChannelStrategy implements IChannelStrategy {
 *   meta = { type: 'lark', label: 'Lark / Feishu', ... }
 *
 *   async send(destination, payload) {
 *     // Send message via Lark
 *   }
 * }
 * ```
 */
export interface IChannelStrategy {
  /**
   * Strategy metadata
   */
  meta: TChannelMeta

  /**
   * Send message
   *
   * @param destination - Channel destination configuration
   * @param payload - Message payload
   * @returns Send result with success status and optional message ID
   */
  send(destination: INotificationDestination, payload: TChannelPayload): Promise<TChannelSendResult>

  /**
   * Validate configuration (optional)
   *
   * @param config - Configuration object to validate
   * @returns Validation result with errors if invalid
   */
  validateConfig?(config: any): Promise<TChannelValidationResult>

  /**
   * Test connection (optional)
   *
   * Used to verify that the channel is properly configured
   * and can send messages.
   *
   * @param config - Configuration object to test
   * @returns Test result with success status and optional message
   */
  testConnection?(config: any): Promise<TChannelTestResult>

  /**
   * Format message (optional)
   *
   * Transform the payload into channel-specific message format.
   *
   * @param payload - Message payload
   * @returns Formatted message in channel-specific format
   */
  formatMessage?(payload: TChannelPayload): any
}
