import path from 'node:path'
import {
    FILE_MEMORY_DREAM_DIR,
    FILE_MEMORY_INDEX_FILENAME,
    FILE_MEMORY_WORKSPACE_PATH,
    FileMemoryType
} from './types'
import { directoryForFileMemoryType, isFileMemoryType } from './taxonomy'

export function getXpertFileMemoryVolumeScope(tenantId: string, xpertId: string) {
    return {
        tenantId,
        catalog: 'xperts' as const,
        xpertId,
        isolateByUser: false
    }
}

export function getFileMemoryWorkspacePath() {
    return FILE_MEMORY_WORKSPACE_PATH
}

export function getXpertFileMemoryWorkspacePath(xpertId: string) {
    const normalizedXpertId = normalizeFileMemoryRelativePath(xpertId)
    if (!normalizedXpertId || normalizedXpertId.includes('/')) {
        throw new Error(`Invalid xpert file memory scope: ${xpertId}`)
    }
    return path.posix.join(FILE_MEMORY_WORKSPACE_PATH, 'xperts', normalizedXpertId)
}

export function normalizeFileMemoryRelativePath(filePath?: string | null) {
    const normalized = path.posix.normalize(`${filePath ?? ''}`.replace(/\\/g, '/').replace(/^\/+/, ''))
    if (!normalized || normalized === '.') {
        return ''
    }
    if (normalized.startsWith('..') || path.posix.isAbsolute(normalized)) {
        throw new Error(`Invalid file memory path: ${normalized}`)
    }
    return normalized
}

export function isManagedDreamPath(filePath: string) {
    const normalized = normalizeFileMemoryRelativePath(filePath)
    return normalized === FILE_MEMORY_DREAM_DIR || normalized.startsWith(`${FILE_MEMORY_DREAM_DIR}/`)
}

export function isMemoryIndexPath(filePath: string) {
    return normalizeFileMemoryRelativePath(filePath) === FILE_MEMORY_INDEX_FILENAME
}

export function resolveTopicDirectory(type: FileMemoryType) {
    return directoryForFileMemoryType(type)
}

export function resolveTopicRelativePath(type: FileMemoryType, fileName: string) {
    const safeFileName = normalizeTopicFileName(fileName)
    return path.posix.join(resolveTopicDirectory(type), safeFileName)
}

export function inferFileMemoryTypeFromPath(filePath: string): FileMemoryType | null {
    const [first] = normalizeFileMemoryRelativePath(filePath).split('/')
    return isFileMemoryType(first) ? first : null
}

export function normalizeTopicFileName(fileName: string) {
    const normalized = normalizeFileMemoryRelativePath(fileName)
    const baseName = path.posix.basename(normalized)
    if (!baseName || baseName === '.' || baseName === '..') {
        throw new Error('File memory topic file name is required')
    }
    return baseName.endsWith('.md') ? baseName : `${baseName}.md`
}
