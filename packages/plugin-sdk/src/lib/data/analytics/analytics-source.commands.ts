import { Command } from '@nestjs/cqrs'
import type { AnalyticsSourceSummary, AnalyticsSourceRef } from '@xpert-ai/contracts'
import type { DataSourceActor } from '../datasource/workbench'
import type { AnalyticsResolvedSource } from './analytics-provider'

/** Host resource owners enumerate sources using the current viewer's ACLs. */
export class ListAnalyticsSourcesCommand extends Command<AnalyticsSourceSummary[]> {
  static readonly type = '[Analytics] List native sources'
  constructor(
    readonly actor: DataSourceActor,
    readonly kind: AnalyticsSourceRef['kind']
  ) {
    super()
  }
}
/** Authorize an exact immutable version; the owner also supplies the post-execution ACL/integrity recheck. */
export class ResolveAnalyticsSourceCommand extends Command<AnalyticsResolvedSource> {
  static readonly type = '[Analytics] Resolve native source'
  constructor(
    readonly actor: DataSourceActor,
    readonly source: AnalyticsSourceRef
  ) {
    super()
  }
}
Reflect.defineMetadata('__command__', { id: ListAnalyticsSourcesCommand.type }, ListAnalyticsSourcesCommand)
Reflect.defineMetadata('__command__', { id: ResolveAnalyticsSourceCommand.type }, ResolveAnalyticsSourceCommand)
