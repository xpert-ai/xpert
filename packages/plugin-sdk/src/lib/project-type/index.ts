import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import type { XpertProjectTypeRef } from '@xpert-ai/contracts'
import { BaseStrategyRegistry } from '../strategy'
import { STRATEGY_META_KEY } from '../types'

export interface ProjectTypeContext extends XpertProjectTypeRef {
  tenantId: string
  organizationId?: string | null
  userId: string
  xpertId: string
  purpose: 'provision' | 'open' | 'create'
}

export interface ProjectTypeBinding {
  /** Persisted business Assistant used when opening a Project from the global list. */
  xpertId?: string
  viewKey: string
  selectionId?: string
}

/** Host calls this provider before claiming or synchronizing an entity Project. */
export interface IProjectTypeProvider {
  /** Must verify the persisted domain-to-project link and actor before returning. */
  resolve(
    context: ProjectTypeContext,
    projectId: string
  ): Promise<ProjectTypeBinding & { name: string; status: 'active' | 'archived' }>
  /** Opens the application's governed creation workflow. */
  createEntry(context: ProjectTypeContext): Promise<ProjectTypeBinding>
}

export const PROJECT_TYPE_PROVIDER = 'PROJECT_TYPE_PROVIDER'
/** Register the stable provider key used by entity-backed App project type declarations. */
export const ProjectTypeProvider = (key: string) =>
  applyDecorators(SetMetadata(PROJECT_TYPE_PROVIDER, key), SetMetadata(STRATEGY_META_KEY, PROJECT_TYPE_PROVIDER))

@Injectable()
export class ProjectTypeProviderRegistry extends BaseStrategyRegistry<IProjectTypeProvider> {
  constructor(discovery: DiscoveryService, reflector: Reflector) {
    super(PROJECT_TYPE_PROVIDER, discovery, reflector)
  }
}
