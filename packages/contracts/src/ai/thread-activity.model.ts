import type { TMessageContentResourceCard } from './resource-card'

/** Terminal SSE error; status retains the HTTP retry/authorization semantics after headers are sent. */
export interface ThreadActivityError {
  version: 1
  status: number
  message: string
}

/** Complete durable discovery snapshot. Tokens are delivered only by the per-run stream. */
export interface ThreadActivitySnapshot {
  version: 1
  controlView?: import('./thread-control-view.schema').ThreadControlView
  threadId: string
  runs: Array<{
    id: string
    status: string
    updatedAt: string
    createdAt: string
    messageRevision: string
    messageCount?: number
  }>
  cards: TMessageContentResourceCard[]
}
