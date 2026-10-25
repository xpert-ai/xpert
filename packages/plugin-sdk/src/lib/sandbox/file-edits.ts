import type { EditOperation, EditResult, ExecuteResponse, MaybePromise, MultiEditResult } from './protocol'
import { z } from 'zod/v3'

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

/** Stops on failure; never promises rollback or silently reapplies completed edits. */
export async function sequentialFileEdits(
  filePath: string,
  edits: EditOperation[],
  apply: (edit: EditOperation) => MaybePromise<EditResult>
): Promise<MultiEditResult> {
  const results: EditResult[] = []
  if (!edits?.length) return { error: 'No edits provided', progress: { mode: 'sequential', appliedEdits: 0 } }
  for (const edit of edits) {
    const result = await apply(edit)
    results.push(result)
    if (result.error)
      return {
        error: `Multi-edit failed at edit ${results.length}: ${result.error}`,
        path: filePath,
        filesUpdate: null,
        results,
        progress: { mode: 'sequential', appliedEdits: results.length - 1, failedEdit: results.length }
      }
  }
  return { path: filePath, filesUpdate: null, results, progress: { mode: 'sequential', appliedEdits: results.length } }
}
