import type { z } from 'zod/v3'
import type {
  ExecutionObservationQueryInput,
  ExecutionObservationOverview,
  ExecutionObservationList,
  ExecutionObservationConversations,
  ExecutionObservationSummary,
  ExecutionObservationDetail,
  ExecutionObservationComparison,
  ExecutionObservationAnomalies,
  executionObservationDetailQuerySchema,
  executionObservationCompareSchema,
  executionObservationAnomalySchema
} from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../../../core/runtime-capability'
import { SecretTokenBindingType, type IApiPrincipal } from '@xpert-ai/contracts'

/** Credential audience check only; the host must still revalidate the human's live admin role and grant. */
export function isExecutionObservationSession(principal: IApiPrincipal | null, xpertId?: string | null): boolean {
  return (
    !principal ||
    Boolean(
      xpertId &&
      principal.principalType === 'client_secret' &&
      principal.clientSecretBindingType === SecretTokenBindingType.USER_XPERT &&
      principal.clientSecretId &&
      principal.resourceScope?.kind === 'assistant' &&
      principal.resourceScope.xpertId === xpertId
    )
  )
}

/** Read-only execution analytics. The host binds identity; arguments cannot change its authorization scope. */
export interface ExecutionObservabilityApi {
  workspaces(input: {
    page: number
    search?: string
  }): Promise<{ items: Array<{ id: string; name: string }>; hasMore: boolean }>
  overview(input: ExecutionObservationQueryInput): Promise<ExecutionObservationOverview>
  conversations(input: ExecutionObservationQueryInput): Promise<ExecutionObservationConversations>
  query(input: ExecutionObservationQueryInput): Promise<ExecutionObservationList>
  summary(input: ExecutionObservationQueryInput): Promise<ExecutionObservationSummary>
  get(input: z.input<typeof executionObservationDetailQuerySchema>): Promise<ExecutionObservationDetail>
  compare(input: z.input<typeof executionObservationCompareSchema>): Promise<ExecutionObservationComparison>
  findAnomalies(input: z.input<typeof executionObservationAnomalySchema>): Promise<ExecutionObservationAnomalies>
}

export const ExecutionObservabilityRuntimeCapability = createRuntimeCapability<ExecutionObservabilityApi>(
  'platform.execution_observability',
  { description: 'Administrator-only execution analytics within the host-bound tenant and organization.' }
)
