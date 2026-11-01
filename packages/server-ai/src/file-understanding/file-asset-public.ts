import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { t } from 'i18next'
import { publicAppPlatformRuntimeError } from '../plugin-resource/app-platform/platform-error'

const text = z.string().nullish()
const date = z.union([z.string(), z.date()]).nullish()
const publicFile = z.object({
    id: text, storageFileId: text, conversationId: text, threadId: text, projectId: text, xpertId: text,
    originalName: text, fileName: text, mimeType: text, size: z.number().nullish(), sha256: text,
    purpose: text, parseMode: text, status: text, capabilities: z.array(z.string()).nullish(),
    workspacePath: text, summary: text, parsedAt: date, failedAt: date, createdAt: date, updatedAt: date
})

export function publicFileAsset<T>(asset: T) {
    return !RequestContext.hasPermission(AIPermissionsEnum.XPERT_VIEW) ? publicFile.parse(asset) : asset
}

export function publicFileParseStatus<T extends { error?: string | null }>(status: T): T {
    return !RequestContext.hasPermission(AIPermissionsEnum.XPERT_VIEW) && status.error
        ? { ...status, error: publicAppPlatformRuntimeError(status.error) ?? t('server-ai:Error.ApplicationRuntimeFailed') } : status
}
