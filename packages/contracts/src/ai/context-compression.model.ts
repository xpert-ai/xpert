import type { I18nText } from '../i18n.model'

export const CONTEXT_COMPRESSION_COMPONENT_TYPE = 'context-compression'

export type TContextCompressionComponentStatus = 'running' | 'success' | 'fail'

export type TContextCompressionComponentReason =
  | 'no_messages'
  | 'no_unprotected_history'
  | 'no_token_gain'
  | 'summary_invalid'
  | 'summary_input_budget'
  | 'summary_output_budget'
  | 'summary_work_limit'
  | 'summary_constraints_lost'
  | 'summary_service_error'
  | 'retry_deferred'
  | 'context_budget_exceeded'
  | 'context_validation_failed'

export type TContextCompressionComponentData = {
  category: 'Tool'
  type: typeof CONTEXT_COMPRESSION_COMPONENT_TYPE
  status: TContextCompressionComponentStatus
  reason?: TContextCompressionComponentReason
  title?: I18nText
  message?: I18nText
  summary?: string
  error?: I18nText
  created_date?: string | Date | null
  end_date?: string | Date | null
}

export function isContextCompressionComponentData(value: unknown): value is TContextCompressionComponentData {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as {
    category?: unknown
    type?: unknown
    status?: unknown
  }

  return (
    candidate.category === 'Tool' &&
    candidate.type === CONTEXT_COMPRESSION_COMPONENT_TYPE &&
    (candidate.status === 'running' || candidate.status === 'success' || candidate.status === 'fail')
  )
}
