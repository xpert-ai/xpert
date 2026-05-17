import { createHash, randomUUID } from 'node:crypto'
import { FileMemorySignal, FileMemorySignalType } from './types'

export const FILE_MEMORY_SIGNAL_WEIGHTS: Record<FileMemorySignalType, number> = {
    explicit_write: 1,
    user_correction: 0.95,
    detail_read: 0.7,
    writeback_candidate: 0.55,
    recall_hit: 0.35,
    index_issue: 0.3
}

export function createFileMemorySignal(input: Omit<FileMemorySignal, 'id' | 'createdAt' | 'weight'> & {
    id?: string
    createdAt?: string
    weight?: number
}): FileMemorySignal {
    return {
        ...input,
        id: input.id ?? randomUUID(),
        createdAt: input.createdAt ?? new Date().toISOString(),
        weight: input.weight ?? FILE_MEMORY_SIGNAL_WEIGHTS[input.type]
    }
}

export function serializeFileMemorySignal(signal: FileMemorySignal) {
    return JSON.stringify(signal)
}

export function parseFileMemorySignal(line: string): FileMemorySignal {
    const parsed = JSON.parse(line)
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('File memory signal must be an object')
    }
    if (!isFileMemorySignalType((parsed as FileMemorySignal).type)) {
        throw new Error('Invalid file memory signal type')
    }
    return parsed as FileMemorySignal
}

export function hashFileMemoryQuery(query: string) {
    return createHash('sha256').update(query.trim().toLowerCase()).digest('hex').slice(0, 16)
}

export function getSignalDatePath(date = new Date()) {
    return `${date.toISOString().slice(0, 10)}.jsonl`
}

export function isFileMemorySignalType(value: unknown): value is FileMemorySignalType {
    return typeof value === 'string' && value in FILE_MEMORY_SIGNAL_WEIGHTS
}
