import type { ModelExecutionContext } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../../core/runtime-capability'

/** Trusted host adapter; bearer callers cannot validate their own execution environment. */
export interface ModelExecutionEnvironmentGuard {
  /** Check trusted runtime state and throw when the grant's bound environment is no longer valid. */
  assertCurrent(context: Readonly<ModelExecutionContext>): Promise<void>
}

/**
 * Keeps shared OS model authorization independent of Pro Computer/Docker lifecycle details.
 * Grant issuance, authentication, revalidation and renewal delegate environment checks to this host adapter.
 * Implementations validate ownership and instance identity so a replaced runtime cannot keep its old grant.
 * Execution validity is independent of desktop viewing sessions; managed runners may also require an operation lease.
 * Other environments can supply their own checks without changing the grant service.
 * This capability validates the bound environment; model selection and usage accounting remain separate concerns.
 */
export const ModelExecutionEnvironmentCapability = createRuntimeCapability<ModelExecutionEnvironmentGuard>(
  'platform.model_execution.environment'
)
