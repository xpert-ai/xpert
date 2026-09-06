// Invariants: recovery starts only after the business method returns successfully.
// Projection and recovery callbacks must be free of business side effects.
// The adapter validates normal output once and validates any fallback separately;
// neither path may rerun the operation or suppress input, authorization or commit failures.
import { ZodError } from 'zod/v3'
import type { PromiseOrValue } from '../types'

// Installed plugins may resolve a different physical SDK copy from the host.
const PREPARED_RESULT = Symbol.for('xpert.tool.prepared-result.v1')

export interface XpertOutputDiagnostic {
  code: 'tool_output_invalid'
  issues: { path: string; code: string }[]
}

export interface XpertPreparedToolResult<T = unknown> {
  readonly [PREPARED_RESULT]: true
  project(): PromiseOrValue<T>
  recover(diagnostic: XpertOutputDiagnostic): PromiseOrValue<T>
}

/** Defer output projection until the adapter can validate and recover its result. */
export function prepareToolResult<T, TRecovery>(
  project: () => PromiseOrValue<T>,
  recover: (diagnostic: XpertOutputDiagnostic) => PromiseOrValue<TRecovery>
): XpertPreparedToolResult<T | TRecovery> {
  return { [PREPARED_RESULT]: true, project, recover }
}

function isPrepared(value: unknown): value is XpertPreparedToolResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    PREPARED_RESULT in value &&
    value[PREPARED_RESULT] === true &&
    'project' in value &&
    typeof value.project === 'function' &&
    'recover' in value &&
    typeof value.recover === 'function'
  )
}

export async function resolveToolResult<T>(value: unknown, validate: (output: unknown) => Promise<T>): Promise<T> {
  if (!isPrepared(value)) return validate(value)
  try {
    return await validate(await value.project())
  } catch (error) {
    const diagnostic: XpertOutputDiagnostic = {
      code: 'tool_output_invalid',
      issues:
        error instanceof ZodError
          ? error.issues.slice(0, 10).map((issue) => ({ path: issue.path.join('.').slice(0, 240), code: issue.code }))
          : []
    }
    // A malformed fallback is a programming error too; never send unchecked data.
    return validate(await value.recover(diagnostic))
  }
}
