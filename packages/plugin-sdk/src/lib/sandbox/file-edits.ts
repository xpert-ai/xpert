import type { EditOperation, EditResult, ExecuteResponse, MaybePromise, MultiEditResult } from './protocol'
import { z } from 'zod/v3'
import { buildBatchEditCommand } from './file-edit-command'

const editMetricsSchema = z.object({
  occurrences: z.number().int().nonnegative(),
  oldLines: z.number().int().nonnegative(),
  newLines: z.number().int().nonnegative(),
  changed: z.boolean(),
  diff: z.object({ removed: z.number().int().nonnegative(), added: z.number().int().nonnegative() }).optional(),
  diffUnavailable: z.enum(['comparison_budget_exceeded', 'diff_unavailable']).optional()
})

function editMetrics(output: string) {
  try {
    const result = editMetricsSchema.safeParse(JSON.parse(output))
    if (!result.success) return undefined
    const { diff, ...metrics } = result.data
    return { ...metrics, ...(diff ? { diff: { removed: diff.removed, added: diff.added } } : {}) }
  } catch {
    return undefined
  }
}

export function editCommandResult(filePath: string, result: ExecuteResponse): EditResult {
  const metrics = editMetrics(result.output)
  switch (result.exitCode) {
    case 0:
      return {
        path: filePath,
        filesUpdate: null,
        ...(metrics ?? { occurrences: parseInt(result.output.trim(), 10) || 1 })
      }
    case 1:
      return { ...metrics, error: `String not found in file '${filePath}'` }
    case 2:
      return { ...metrics, error: `Multiple occurrences found in '${filePath}'. Use replaceAll=true to replace all.` }
    case 3:
      return { ...metrics, error: `Error: File '${filePath}' not found` }
    default:
      return { error: `Unknown error editing file '${filePath}'` }
  }
}

function sequenceResult(path: string, results: EditResult[]): MultiEditResult {
  const count = results.length
  if (!count) return { error: 'No edits provided', progress: { mode: 'sequential', appliedEdits: 0 } }
  const last = results[count - 1]
  if (last.error) {
    return {
      path,
      filesUpdate: null,
      results,
      error: `Multi-edit failed at edit ${count}: ${last.error}`,
      progress: { mode: 'sequential', appliedEdits: count - 1, failedEdit: count }
    }
  }
  return { path, filesUpdate: null, results, progress: { mode: 'sequential', appliedEdits: count } }
}

/** Stops on failure; never promises rollback or silently reapplies completed edits. */
export async function sequentialFileEdits(
  filePath: string,
  edits: EditOperation[],
  apply: (edit: EditOperation) => MaybePromise<EditResult>
): Promise<MultiEditResult> {
  const results: EditResult[] = []
  for (const edit of edits ?? []) {
    const result = await apply(edit)
    results.push(result)
    if (result.error) break
  }
  return sequenceResult(filePath, results)
}

const batchReceiptSchema = z.array(
  z.object({
    code: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    metrics: editMetricsSchema
  })
)

function batchSteps(output: string, count: number) {
  let raw: unknown
  try {
    raw = JSON.parse(output)
  } catch {
    return undefined
  }
  const parsed = batchReceiptSchema.safeParse(raw)
  if (!parsed.success) return undefined
  const steps = parsed.data
  const failure = steps.findIndex((step) => step.code !== 0)
  if (!steps.length || steps.length > count) return undefined
  if (
    steps.some(({ code, metrics }) =>
      code === 0 ? metrics.occurrences === 0 : metrics.changed || metrics.occurrences !== 0
    )
  )
    return undefined
  if (failure < 0 ? steps.length !== count : failure !== steps.length - 1) return undefined
  return steps
}

/** Keep the encoded shell argument bounded. An oversized edit runs alone. */
function batchEnd(path: string, edits: EditOperation[], start: number) {
  let bytes = Buffer.byteLength(JSON.stringify(path))
  let end = start
  while (end < edits.length && end - start < 32) {
    bytes += Buffer.byteLength(JSON.stringify(edits[end])) + 1
    if (bytes > 64 * 1024) break
    end++
  }
  return Math.max(start + 1, end)
}

export async function groupedFileEdits(
  path: string,
  edits: EditOperation[],
  execute: (command: string) => MaybePromise<ExecuteResponse>
): Promise<MultiEditResult> {
  const results: EditResult[] = []
  while (results.length < (edits?.length ?? 0)) {
    const start = results.length
    const end = batchEnd(path, edits, start)
    const unconfirmed = (reason: string): MultiEditResult => ({
      path,
      filesUpdate: null,
      results,
      error: `Sandbox multi-edit: ${reason}. Read the current file before retrying edits ${start + 1}–${end}.`,
      progress: { mode: 'sequential', appliedEdits: start, unconfirmedEdits: { from: start + 1, to: end } }
    })

    const command = buildBatchEditCommand(path, edits.slice(start, end))
    let response: ExecuteResponse
    try {
      response = await execute(command)
    } catch {
      return unconfirmed('execution receipt unavailable')
    }
    if (response.timedOut) return unconfirmed('execution timed out')
    if (response.terminationReason) return unconfirmed(`execution terminated (${response.terminationReason})`)
    if (response.exitCode !== 0) return unconfirmed('execution did not exit successfully')
    if (response.truncated) return unconfirmed('truncated execution receipt')
    const steps = batchSteps(response.output, end - start)
    if (!steps) return unconfirmed('invalid execution receipt')

    for (const step of steps) {
      results.push(
        editCommandResult(path, { output: JSON.stringify(step.metrics), exitCode: step.code, truncated: false })
      )
    }
    if (results[results.length - 1].error) break
  }
  return sequenceResult(path, results)
}
