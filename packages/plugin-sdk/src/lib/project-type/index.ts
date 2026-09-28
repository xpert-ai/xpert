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

/**
 * ORM-independent write access to the host's current creation transaction.
 * The host owns commit/rollback; this object is valid only during the awaited
 * creation hook. Entities must be instances of registered plugin entity classes.
 */
export interface ProjectCreationTransaction {
  /** Save an entity and return its persisted values without committing the transaction. */
  save<T extends object>(entity: T): Promise<T>
}

/** Host-owned identity and transaction for an empty conversation's first send. */
export interface ConversationProjectCreation {
  projectId: string
  conversationId: string
  workspaceId: string
  name: string
  /**
   * Persist only application records through this writer. The host creates the
   * platform Project and binds the conversation in the same transaction. Do not
   * call provisioning, start agents, or perform external I/O from this hook.
   */
  transaction: ProjectCreationTransaction
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
  /**
   * Optional opt-in to first-send creation. Persist the business entity and its
   * link to input.projectId atomically using input.transaction, then return its entry
   * and desired name. Exceptions roll back the whole bootstrap. The host checks
   * permissions and serializes retries with a conversation row lock first.
   */
  createForConversation?(
    context: ProjectTypeContext,
    input: ConversationProjectCreation
  ): Promise<ProjectTypeBinding & { name: string; status: 'active' }>
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
