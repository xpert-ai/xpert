import type { TMessageContentWidget } from '@xpert-ai/contracts'

export interface MessageWidgetReference {
  threadId: string
  messageId: string
  widgetId: string
  provider: string
}

export interface IMessageWidgetProvider {
  /** Explicit opt-in to producing audience-safe content for restricted runtime sessions. */
  readonly visibleInRestrictedSessions?: boolean
  /** Only currently authorized cards may be returned. Omitted references remain hidden. */
  resolve(
    references: readonly MessageWidgetReference[]
  ): Promise<Array<{ messageId: string; widget: TMessageContentWidget }>>
}
