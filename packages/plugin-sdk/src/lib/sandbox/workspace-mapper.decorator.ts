import { applyDecorators, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '../types'

export const SANDBOX_WORKSPACE_MAPPER = 'SANDBOX_WORKSPACE_MAPPER'

/** Associates a workspace path mapper with a named Runtime Provider strategy. */
export const SandboxWorkspaceMapperStrategy = (provider: string) =>
  applyDecorators(
    SetMetadata(SANDBOX_WORKSPACE_MAPPER, provider),
    SetMetadata(STRATEGY_META_KEY, SANDBOX_WORKSPACE_MAPPER)
  )
