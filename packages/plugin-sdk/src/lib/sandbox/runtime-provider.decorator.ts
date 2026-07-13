import { applyDecorators, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '../types'

export const SANDBOX_RUNTIME_PROVIDER = 'SANDBOX_RUNTIME_PROVIDER'

/** Marks a built-in or system-plugin class as a named Sandbox Runtime Provider strategy. */
export const SandboxRuntimeProviderStrategy = (provider: string) =>
  applyDecorators(
    SetMetadata(SANDBOX_RUNTIME_PROVIDER, provider),
    SetMetadata(STRATEGY_META_KEY, SANDBOX_RUNTIME_PROVIDER)
  )
