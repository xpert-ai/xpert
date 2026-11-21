export interface WidgetActionContext {
  threadId: string
  messageId: string
  widgetId: string
  /** Untrusted form values supplied by the caller. */
  fields: Record<string, unknown>
}

export interface IWidgetActionHandler {
  /** Receipt-backed widgets require the handler to verify the authoritative offer before performing any mutation. */
  readonly widgetSource?: 'message' | 'receipt'
  /** The handler enforces business permissions and validates the submitted fields. */
  execute(context: WidgetActionContext): Promise<{ refresh?: 'thread' }>
}

export interface IWidgetActionProvider {
  /** Local names contain only letters, digits, underscores or hyphens and are scoped to this provider. */
  readonly actions: Readonly<Record<string, IWidgetActionHandler>>
}
