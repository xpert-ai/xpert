export const MODEL_OUTPUT_VALIDATION_ERROR_CODE = 'MODEL_OUTPUT_VALIDATION_ERROR' as const

export type ModelOutputValidationIssue = {
  toolName?: string
  error: string
  fieldName?: string
  characterOffset?: number
  hint?: string
}

export type ModelOutputRepairContext = {
  kind: 'invalid_tool_calls'
  issues: ModelOutputValidationIssue[]
}

/**
 * Signals that the provider returned a model response which could not be
 * accepted, but can be regenerated safely because no tool was executed.
 *
 * Keep `repairContext` compact and free of raw tool arguments. Model
 * middleware may use it as retry-local feedback, so it must never contain
 * credentials, complete documents, or other unbounded model output.
 */
export class ModelOutputValidationError extends Error {
  readonly code = MODEL_OUTPUT_VALIDATION_ERROR_CODE
  readonly retryable = true

  constructor(
    message: string,
    readonly repairContext: ModelOutputRepairContext
  ) {
    super(message)
    this.name = 'ModelOutputValidationError'
  }
}

export function isModelOutputValidationError(error: unknown): error is ModelOutputValidationError {
  if (!error || typeof error !== 'object') return false

  const candidate = error as Partial<ModelOutputValidationError>
  return (
    candidate.code === MODEL_OUTPUT_VALIDATION_ERROR_CODE &&
    candidate.retryable === true &&
    candidate.repairContext?.kind === 'invalid_tool_calls' &&
    Array.isArray(candidate.repairContext.issues)
  )
}
