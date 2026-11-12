// Beta: internal Artifact byte storage may change incompatibly.
// System FileStorage controls byte operations; public file references remain storage-agnostic.
// LOCAL retains protected Volume namespaces, never the public upload directory.
import { createHash } from 'node:crypto'
import { FileStorageProviderEnum } from '@xpert-ai/contracts'
import type { IFileStorageProvider } from '@xpert-ai/plugin-sdk'
import { FileStorage } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { assertWorkspaceLeases } from './workspace-storage-lock'
import { VolumeWorkspaceStorage } from './workspace-storage'
import type { VolumeHandle } from './volume'

const ARTIFACT_CONTENT_MAX_BYTES = 50 * 1024 * 1024
const ARTIFACT_CONTENT_NAMESPACE = 'artifact_content'
const digest = (buffer: Buffer | string) => createHash('sha256').update(buffer).digest('hex')

function providerFor(volume: VolumeHandle, organizationId?: string | null) {
    const provider = new FileStorage(undefined, { ...volume.scope, organizationId }).getProvider()
    if (!provider)
        throw new Error(
            t('server-ai:Error.ImmutableStorageProviderUnavailable', {
                defaultValue: 'The configured file storage provider is unavailable.'
            })
        )
    return provider
}

/** Storage changes require data migration; no per-reference backend routing or fallback. */
export function artifactByteStorage(volume: VolumeHandle, organizationId?: string | null) {
    return contentStorage(volume, providerFor(volume, organizationId), organizationId)
}

function contentStorage(volume: VolumeHandle, provider: IFileStorageProvider, organizationId?: string | null) {
    const namespace = ARTIFACT_CONTENT_NAMESPACE
    const scope = volume.scope
    const identity = [
        scope.tenantId,
        organizationId ?? null,
        scope.catalog,
        scope.projectId ?? null,
        scope.xpertId ?? null,
        scope.catalog === 'users' || scope.catalog === 'user-xperts' || scope.isolateByUser ? scope.userId : null,
        scope.knowledgeId ?? null,
        scope.rootId ?? null
    ]
    const prefix = `workspace-content/v1/${encodeURIComponent(scope.tenantId)}/${digest(JSON.stringify(identity))}/${namespace}/`
    const local =
        provider.name === FileStorageProviderEnum.LOCAL
            ? new VolumeWorkspaceStorage(async () => volume, namespace)
            : undefined
    function checked(relative: string) {
        if (!/^[a-f0-9-]{36}\/[a-f0-9]{64}$/.test(relative))
            throw new Error(
                t('server-ai:Error.ImmutableContentPathInvalid', { defaultValue: 'Invalid immutable content path.' })
            )
        return relative.split('/')[1]
    }
    return {
        async write(relative: string, buffer: Uint8Array | string) {
            await assertWorkspaceLeases()
            const bytes = Buffer.from(buffer)
            if (bytes.length > ARTIFACT_CONTENT_MAX_BYTES || digest(bytes) !== checked(relative))
                throw new Error(
                    t('server-ai:Error.ImmutableContentBytesInvalid', {
                        defaultValue: 'Invalid immutable content bytes or content exceeds 50 MiB.'
                    })
                )
            if (local) await local.write(relative, bytes)
            else
                await volume.withWriteBudget(`.apps/${namespace}/${relative}`, bytes, () =>
                    provider.putFile(bytes, prefix + relative, { contentType: 'application/octet-stream' })
                )
        },
        async read(relative: string) {
            const expected = checked(relative)
            let bytes: Buffer
            try {
                bytes = local ? await local.read(relative) : await provider.getFile(prefix + relative)
            } catch (error) {
                if (typeof error === 'object' && error && 'code' in error && error.code === 'NoSuchKey')
                    throw Object.assign(
                        new Error(
                            t('server-ai:Error.ImmutableContentNotFound', {
                                defaultValue: 'Immutable content was not found.'
                            })
                        ),
                        { code: 'ENOENT' }
                    )
                throw error
            }
            if (bytes.length > ARTIFACT_CONTENT_MAX_BYTES || digest(bytes) !== expected)
                throw new Error(
                    t('server-ai:Error.ImmutableContentDigestMismatch', {
                        defaultValue: 'Immutable content digest mismatch.'
                    })
                )
            return bytes
        },
        async remove(relative: string) {
            await assertWorkspaceLeases()
            checked(relative)
            if (local) await local.remove(relative)
            else await volume.withRemovalBudget(() => provider.deleteFile(prefix + relative))
        }
    }
}
