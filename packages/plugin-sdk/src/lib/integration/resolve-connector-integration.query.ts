import { Query } from '@nestjs/cqrs'
import type { IIntegration } from '@xpert-ai/contracts'

/** Read an app for an authorized connector using its persisted scope, including public OAuth callbacks. */
export class ResolveConnectorIntegrationQuery extends Query<IIntegration | null> {
  static readonly type = '[Integration] Resolve connector application'
  constructor(
    readonly id: string,
    readonly provider: string,
    readonly scope: { tenantId: string; organizationId: string | null }
  ) {
    super()
  }
}
Reflect.defineMetadata('__query__', { id: ResolveConnectorIntegrationQuery.type }, ResolveConnectorIntegrationQuery)
