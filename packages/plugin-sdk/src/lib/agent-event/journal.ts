import { createHash, randomUUID } from 'node:crypto'
import type {
  AgentEventContext,
  AgentEventDelivery,
  AgentEventPublisher,
  EventDecision,
  PluginAgentEvent
} from './index'
import { agentEventDecisionSchema, pluginAgentEventSchema } from './index'

export interface AgentEventSql {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T>
}

export function agentEventDigest(value: unknown): string {
  const sorted = JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === 'object' && !Array.isArray(item))
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    return item
  })
  return createHash('sha256').update(sorted).digest('hex')
}

interface Route {
  binding: string
  revision: number
  enabled: boolean
}
interface Fact {
  id: string
  event: PluginAgentEvent
  snapshot: unknown
  receipt: string | null
  decision: EventDecision | null
}
export interface AgentEventOrigin {
  tenantId: string
  organizationId: string
  ref: string
}

/** PostgreSQL source journal scoped to one plugin's own route and fact tables. */
export class PluginEventJournal {
  private readonly routes: string
  private readonly facts: string
  constructor(prefix: string) {
    if (!/^[a-z][a-z0-9_]{1,45}$/.test(prefix)) throw new Error('invalid_event_journal_prefix')
    this.routes = prefix + '_route'
    this.facts = prefix + '_fact'
  }

  private async lock(tx: AgentEventSql, origin: AgentEventOrigin) {
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      JSON.stringify([this.routes, origin.tenantId, origin.organizationId, origin.ref])
    ])
  }

  async configure(tx: AgentEventSql, ctx: AgentEventContext, enabled: boolean) {
    const origin = { tenantId: ctx.tenantId, organizationId: ctx.organizationId, ref: ctx.sourceBindingRef }
    await this.lock(tx, origin)
    const [route] = await tx.query<Route[]>(`SELECT * FROM ${this.routes} WHERE tenant=$1 AND org=$2 AND ref=$3`, [
      origin.tenantId,
      origin.organizationId,
      origin.ref
    ])
    if (route && (route.binding !== ctx.bindingId || route.revision > ctx.bindingRevision))
      throw new Error('source_binding_changed')
    await tx.query(
      `INSERT INTO ${this.routes}(binding,tenant,org,ref,revision,enabled) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(binding) DO UPDATE SET revision=EXCLUDED.revision,enabled=EXCLUDED.enabled`,
      [ctx.bindingId, ctx.tenantId, ctx.organizationId, ctx.sourceBindingRef, ctx.bindingRevision, enabled]
    )
  }

  async route(tx: AgentEventSql, origin: AgentEventOrigin) {
    await this.lock(tx, origin)
    const [route] = await tx.query<Route[]>(`SELECT * FROM ${this.routes} WHERE tenant=$1 AND org=$2 AND ref=$3`, [
      origin.tenantId,
      origin.organizationId,
      origin.ref
    ])
    return route
  }

  async capture(
    tx: AgentEventSql,
    route: Route,
    data: Omit<PluginAgentEvent, 'bindingRevision' | 'fact'>,
    snapshot: unknown,
    factKey: string,
    revision: string
  ) {
    const event = pluginAgentEventSchema.parse({
      ...data,
      bindingRevision: route.revision,
      fact: { key: factKey, revision, sha256: agentEventDigest(snapshot) }
    })
    const [existing] = await tx.query<Fact[]>(`SELECT event FROM ${this.facts} WHERE binding=$1 AND source=$2`, [
      route.binding,
      event.sourceEventId
    ])
    if (existing) {
      if (
        existing.event.type !== event.type ||
        existing.event.schemaVersion !== event.schemaVersion ||
        existing.event.fact.key !== event.fact.key ||
        existing.event.fact.revision !== event.fact.revision ||
        existing.event.fact.sha256 !== event.fact.sha256 ||
        existing.event.subject.key !== event.subject.key ||
        existing.event.subject.kind !== event.subject.kind
      )
        throw new Error('event_source_conflict')
      return true
    }
    if (!route.enabled) return false
    await tx.query(`INSERT INTO ${this.facts}(id,binding,source,event,snapshot) VALUES($1,$2,$3,$4,$5)`, [
      randomUUID(),
      route.binding,
      event.sourceEventId,
      event,
      JSON.stringify(snapshot)
    ])
    return true
  }

  async drain(db: AgentEventSql, ctx: AgentEventContext, publisher: AgentEventPublisher, limit: number) {
    const facts = await db.query<Fact[]>(
      `SELECT f.id,f.event FROM ${this.facts} f JOIN ${this.routes} r USING(binding)
      WHERE r.binding=$1 AND r.tenant=$2 AND r.org=$3 AND r.ref=$4 AND f.receipt IS NULL AND f.error IS NULL
      ORDER BY f.seq LIMIT $5`,
      [ctx.bindingId, ctx.tenantId, ctx.organizationId, ctx.sourceBindingRef, limit]
    )
    for (const fact of facts) {
      ctx.signal.throwIfAborted()
      const result = await publisher.publish(fact.event)
      if (result.status === 'rejected')
        await db.query(`UPDATE ${this.facts} SET error=$2 WHERE id=$1 AND receipt IS NULL`, [fact.id, result.code])
      else
        await db.query(`UPDATE ${this.facts} SET receipt=$2 WHERE id=$1 AND (receipt IS NULL OR receipt=$2)`, [
          fact.id,
          result.receiptId
        ])
    }
    return { more: facts.length === limit }
  }

  async decide(
    tx: AgentEventSql,
    ctx: AgentEventContext,
    delivery: AgentEventDelivery,
    apply: (snapshot: unknown) => Promise<EventDecision>
  ): Promise<EventDecision> {
    const [fact] = await tx.query<Fact[]>(
      `SELECT f.* FROM ${this.facts} f JOIN ${this.routes} r USING(binding)
      WHERE r.binding=$1 AND r.tenant=$2 AND r.org=$3 AND r.ref=$4 AND r.revision=$5 AND f.source=$6
      FOR SHARE OF r FOR UPDATE OF f`,
      [
        ctx.bindingId,
        ctx.tenantId,
        ctx.organizationId,
        ctx.sourceBindingRef,
        ctx.bindingRevision,
        delivery.event.sourceEventId
      ]
    )
    if (
      !fact ||
      fact.event.bindingRevision !== ctx.bindingRevision ||
      agentEventDigest(fact.event) !== agentEventDigest(delivery.event) ||
      agentEventDigest(fact.snapshot) !== delivery.event.fact.sha256 ||
      (fact.receipt && fact.receipt !== delivery.receiptId)
    )
      return { status: 'blocked', reasonCode: 'source_binding_changed' }
    if (fact.decision) return agentEventDecisionSchema.parse(fact.decision)
    const partition = JSON.stringify([ctx.bindingId, delivery.event.subject.kind, delivery.event.subject.key])
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [partition])
    const [newer] = await tx.query<{ exists: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM ${this.facts} WHERE binding=$1
      AND event->'subject'=$2::jsonb AND fence>$3::bigint) AS exists`,
      [ctx.bindingId, JSON.stringify(delivery.event.subject), delivery.fence]
    )
    if (newer.exists) throw new Error('stale_event_fence')
    ctx.signal.throwIfAborted()
    const result = agentEventDecisionSchema.parse(await apply(fact.snapshot))
    ctx.signal.throwIfAborted()
    await tx.query(`UPDATE ${this.facts} SET decision=$2,receipt=$3,fence=$4 WHERE id=$1`, [
      fact.id,
      result,
      delivery.receiptId,
      delivery.fence
    ])
    return result
  }
}
