import type { IUploadFileStorageTarget } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'

const EXTERNAL_STORAGE_TARGET_KEYS = new Set(['kind', 'directory', 'prefix'])

/** Parse an external upload hint without accepting client-controlled strategy or filesystem authority. */
export function resolveExternalStorageUploadTarget(
    targetValue: string | undefined,
    defaults: IUploadFileStorageTarget
): IUploadFileStorageTarget {
    if (!targetValue) {
        return { ...defaults }
    }

    let target: unknown
    try {
        target = JSON.parse(targetValue)
    } catch {
        throw invalidExternalUploadTarget()
    }

    if (!target || typeof target !== 'object' || Array.isArray(target) || !('kind' in target)) {
        throw invalidExternalUploadTarget()
    }
    if (target.kind !== 'storage' || Object.keys(target).some((key) => !EXTERNAL_STORAGE_TARGET_KEYS.has(key))) {
        throw invalidExternalUploadTarget()
    }
    if ('directory' in target && target.directory !== defaults.directory) {
        throw invalidExternalUploadTarget()
    }
    if ('prefix' in target && target.prefix !== defaults.prefix) {
        throw invalidExternalUploadTarget()
    }

    return { ...defaults }
}

function invalidExternalUploadTarget() {
    return new BadRequestException(
        t('server-ai:Error.ExternalUploadTargetInvalid', {
            defaultValue: 'External uploads only support the server-managed storage target'
        })
    )
}
