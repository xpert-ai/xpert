import type { EditOperation, EditResult, ExecuteResponse, MaybePromise, MultiEditResult } from './protocol'

export function editCommandResult(filePath: string, result: ExecuteResponse): EditResult {
  switch (result.exitCode) {
    case 0:
      return { path: filePath, filesUpdate: null, occurrences: parseInt(result.output.trim(), 10) || 1 }
    case 1:
      return { error: `String not found in file '${filePath}'` }
    case 2:
      return { error: `Multiple occurrences found in '${filePath}'. Use replaceAll=true to replace all.` }
    case 3:
      return { error: `Error: File '${filePath}' not found` }
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
