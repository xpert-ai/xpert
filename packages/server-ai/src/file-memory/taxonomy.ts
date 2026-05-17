import { FILE_MEMORY_TYPES, FileMemoryType } from './types'

export function isFileMemoryType(value: unknown): value is FileMemoryType {
    return typeof value === 'string' && FILE_MEMORY_TYPES.includes(value as FileMemoryType)
}

export function assertFileMemoryType(value: unknown): FileMemoryType {
    if (isFileMemoryType(value)) {
        return value
    }

    throw new Error(`Invalid file memory type: ${String(value)}`)
}

export function describeFileMemoryType(type: FileMemoryType) {
    switch (type) {
        case 'user':
            return 'stable collaboration preferences and user-facing working style facts'
        case 'feedback':
            return 'durable corrections, confirmations, rules, and operating preferences'
        case 'project':
            return 'project context, decisions, goals, rollout state, and dated constraints'
        case 'reference':
            return 'durable pointers to docs, systems, repos, dashboards, and external resources'
    }
}

export function directoryForFileMemoryType(type: FileMemoryType) {
    return type
}
