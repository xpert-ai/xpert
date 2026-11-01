import { ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'
import path from 'node:path'

export const KNOWLEDGEBASE_TASK_RELATIONS = new Set(['documents'])

export function knowledgebaseTaskAccessDenied() {
    return new ForbiddenException(
        t('server-ai:Error.KnowledgebaseTaskAccessDenied', {
            defaultValue: 'You do not have access to this knowledgebase task'
        })
    )
}

export function assertSafeKnowledgebaseTaskRelations(relations: unknown): asserts relations is string[] | undefined {
    if (relations === undefined) {
        return
    }

    if (
        !Array.isArray(relations) ||
        relations.some((relation) => typeof relation !== 'string' || !KNOWLEDGEBASE_TASK_RELATIONS.has(relation))
    ) {
        throw knowledgebaseTaskAccessDenied()
    }
}

export function resolveKnowledgebaseTaskFilePath(filesPath: string, filePath: string | undefined): string {
    if (typeof filePath !== 'string') {
        throw knowledgebaseTaskAccessDenied()
    }

    const normalizedPath = filePath.trim().replace(/\\/g, '/')
    const prefix = `${filesPath}/`
    if (
        !normalizedPath ||
        normalizedPath.includes('\0') ||
        path.posix.isAbsolute(normalizedPath) ||
        !normalizedPath.startsWith(prefix)
    ) {
        throw knowledgebaseTaskAccessDenied()
    }

    const relativePath = normalizedPath.slice(prefix.length)
    if (!relativePath) {
        throw knowledgebaseTaskAccessDenied()
    }
    return relativePath
}
