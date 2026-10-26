import type { TMessageContentResourceCard } from './resource-card'

/** Complete durable discovery snapshot. Tokens are delivered only by the per-run stream. */
export interface ThreadActivitySnapshot {
  version: 1
  controlView?: import('./thread-control-view.schema').ThreadControlView
  threadId: string
  runs: Array<{ id: string; status: string; updatedAt: string; createdAt: string; messageRevision: string }>
  cards: TMessageContentResourceCard[]
}
