import type { FileMemoryDreamRunReport } from './types'

export function mergeDreamConflicts(
    reviewConflicts: FileMemoryDreamRunReport['unresolvedConflicts'],
    validationConflicts: FileMemoryDreamRunReport['unresolvedConflicts']
) {
    const merged: FileMemoryDreamRunReport['unresolvedConflicts'] = []
    for (const conflict of [...reviewConflicts, ...validationConflicts]) {
        const key = `${conflict.path ?? ''}\n${conflict.reason}`
        if (!merged.some((existing) => `${existing.path ?? ''}\n${existing.reason}` === key)) {
            merged.push(conflict)
        }
    }
    return merged
}
