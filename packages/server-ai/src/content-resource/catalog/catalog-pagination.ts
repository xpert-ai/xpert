import { createHash } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import { z } from 'zod'
import { t } from 'i18next'
import type { ContentCatalogApi } from '@xpert-ai/plugin-sdk'
import type { ContentResourceEntry } from './content-entry.entity'

export type CatalogListInput = Parameters<ContentCatalogApi['list']>[0]
const cursorSchema = z.object({ key: z.string(), at: z.string().datetime().nullable(), id: z.string().uuid() }).strict()
function queryKey(input: CatalogListInput) {
    return createHash('sha256')
        .update(
            JSON.stringify([
                input.actor,
                input.assistantId,
                input.projectId,
                input.typeId,
                input.search ?? '',
                !!input.deleted,
                [...(input.excludedProviderKeys ?? [])].sort(),
                input.contentIds ? [...input.contentIds].sort() : null
            ])
        )
        .digest('hex')
}
export function catalogCursor(input: CatalogListInput, row: ContentResourceEntry) {
    return Buffer.from(
        JSON.stringify({ key: queryKey(input), at: row.sourceUpdatedAt?.toISOString() ?? null, id: row.id })
    ).toString('base64url')
}
export function parseCatalogCursor(input: CatalogListInput) {
    if (!input.cursor) return undefined
    try {
        if (input.cursor.length > 1000) throw new Error('cursor')
        const cursor = cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')))
        if (cursor.key !== queryKey(input)) throw new Error('scope')
        return cursor
    } catch {
        throw new BadRequestException(t('server-ai:Error.ContentOperationInvalid'))
    }
}
