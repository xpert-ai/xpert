import { checkedWorkspacePath, readWorkspaceFile, writeWorkspaceFile } from '../../shared/volume/workspace-file-io'
import { Optional } from '@nestjs/common'
import { ContentFileOwnershipService } from '../../shared/volume/content-file-ownership.service'
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { lstat, rename } from 'node:fs/promises'
import path from 'node:path'
import { t } from 'i18next'
import {
    ProjectFilesRuntimeCapability, RequestContext,
    type ProjectFileEntry, type ProjectFileScope, type ProjectFilesApi
} from '@xpert-ai/plugin-sdk'
import type { TFileDirectory } from '@xpert-ai/contracts'
import { RuntimeCapabilityProvider } from '../../shared/runtime'
import { VOLUME_CLIENT, VolumeClient, VolumeHandle, isProjectGovernedContentPath } from '../../shared/volume'
import { assertWorkspaceLeases, withWorkspaceLock } from '../../shared/volume/workspace-storage-lock'
import { ProjectAccessRuntimeService } from './project-access-runtime.service'

const missing = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'

@Injectable()
@RuntimeCapabilityProvider(ProjectFilesRuntimeCapability)
export class ProjectFilesRuntimeService implements ProjectFilesApi {
    constructor(
        private readonly access: ProjectAccessRuntimeService,
        @Inject(VOLUME_CLIENT) private readonly volumes: Pick<VolumeClient, 'resolve'>,
        @Optional() private readonly ownership?: ContentFileOwnershipService
    ) {}

    private async volume(input: ProjectFileScope, write = false) {
        const actor = input.actor
        // A trusted background actor is supported; a current request cannot impersonate another user.
        if ((RequestContext.currentTenantId() && RequestContext.currentTenantId() !== actor.tenantId) ||
            (RequestContext.currentUserId() && RequestContext.currentUserId() !== actor.userId) ||
            (RequestContext.getOrganizationId() && RequestContext.getOrganizationId() !== actor.organizationId)) {
            throw new ForbiddenException(t('server-ai:Error.ContentAccessDenied'))
        }
        const access = write ? await this.access.assertEdit(input)
            : (await this.access.listReadable({ actor, projectIds: [input.projectId] }))[0]
        if (!access) throw new ForbiddenException(t('server-ai:Error.ProjectMembershipRequired'))
        return this.volumes.resolve({ tenantId: actor.tenantId, catalog: 'projects', projectId: input.projectId })
    }

    async list(input: ProjectFileScope & { path?: string; depth?: number }): Promise<ProjectFileEntry[]> {
        const volume = await this.volume(input)
        const folder = input.path ? checkedWorkspacePath(input.path) : ''
        let entries: TFileDirectory[]
        try { entries = await volume.list({ path: folder, deepth: Math.min(12, Math.max(1, input.depth ?? 8)) }) }
        catch (error) { if (missing(error)) return []; throw error }
        const result: ProjectFileEntry[] = []
        const flatten = (items: TFileDirectory[]) => {
            for (const item of items) {
                const filePath = item.fullPath ?? item.filePath
                if (filePath && !isProjectGovernedContentPath(filePath)) result.push({
                    path: filePath, kind: item.fileType === 'directory' ? 'directory' : 'file',
                    size: item.size ?? 0, updatedAt: new Date(item.updatedAt).toISOString()
                })
                if (item.children) flatten(item.children)
            }
        }
        flatten(entries)
        return result
    }

    async read(input: ProjectFileScope & { path: string }) {
        const volume = await this.volume(input)
        return readWorkspaceFile(volume, input.path)
    }

    async write(input: ProjectFileScope & { path: string; buffer: Buffer; expectedHash: string | null }) {
        const volume = await this.volume(input, true)
        const filePath = checkedWorkspacePath(input.path, true)
        if (input.buffer.length > 25 * 1024 * 1024) throw new BadRequestException(t('server-ai:Error.ProjectFileTooLarge'))
        return writeWorkspaceFile(volume, filePath, input.buffer, {
            expectedHash: input.expectedHash,
            authorize: () => this.volume(input, true),
            assertUnmanaged: () => this.ownership?.assertUnmanaged(input.actor.tenantId, input.projectId, filePath)
        })
    }

    async mkdir(input: ProjectFileScope & { path: string }) {
        const volume = await this.volume(input, true)
        await volume.ensureRoot()
        await VolumeHandle.ensureDirectory(volume.serverRoot, checkedWorkspacePath(input.path, true), volume.serverRoot)
    }

    async move(input: ProjectFileScope & { path: string; destination: string }) {
        const authorize = async () => {
            await this.volume(input, true)
            await this.ownership?.assertUnmanaged(input.actor.tenantId, input.projectId, input.path, true)
            await this.ownership?.assertUnmanaged(input.actor.tenantId, input.projectId, input.destination, true)
        }
        await authorize()
        return this.moveFile(input, await this.volume(input, true), authorize)
    }

    /** Internal replay of an already authorized, durable content-location intent. Not a runtime capability. */
    async assertMoveAvailable(input: ProjectFileScope & { path: string; destination: string }) {
        const volume = await this.volume(input, true)
        checkedWorkspacePath(input.path, true); checkedWorkspacePath(input.destination, true)
        if (input.path === input.destination) return
        try {
            const target = await VolumeHandle.openExistingFile(volume.serverRoot, input.destination, { boundaryRoot: volume.serverRoot })
            await target.fileHandle.close()
        } catch (error) { if (missing(error)) return; throw error }
        throw new ConflictException(t('server-ai:Error.ProjectFileChanged'))
    }

    /** Internal replay of an already authorized, durable content-location intent. Not a runtime capability. */
    async moveAccepted(input: ProjectFileScope & { path: string; destination: string }) {
        return this.moveFile(input, await this.volumes.resolve({ tenantId: input.actor.tenantId, projectId: input.projectId, catalog: 'projects' }), async () => undefined)
    }
    async readAccepted(input: { tenantId: string; projectId: string; path: string }) {
        const volume = await this.volumes.resolve({ tenantId: input.tenantId, projectId: input.projectId, catalog: 'projects' })
        return readWorkspaceFile(volume, input.path)
    }
    private async moveFile(input: ProjectFileScope & { path: string; destination: string }, volume: VolumeHandle, authorize: () => Promise<unknown>) {
        const source = checkedWorkspacePath(input.path, true), destination = checkedWorkspacePath(input.destination, true)
        if (source === destination) return
        if (destination.startsWith(`${source}/`)) throw new ConflictException(t('server-ai:Error.ProjectFileChanged'))
        await withWorkspaceLock(volume.serverRoot, async () => {
            const opened = await VolumeHandle.openExistingFile(volume.serverRoot, source, { boundaryRoot: volume.serverRoot })
            try {
                if (opened.fileStat.nlink > 1 && opened.fileStat.isFile()) throw new ForbiddenException(t('server-ai:Error.ContentAccessDenied'))
                await VolumeHandle.ensureDirectory(volume.serverRoot, path.posix.dirname(destination), volume.serverRoot)
                const from = await VolumeHandle.openExistingFile(volume.serverRoot, path.posix.dirname(source), { boundaryRoot: volume.serverRoot })
                const to = await VolumeHandle.openExistingFile(volume.serverRoot, path.posix.dirname(destination), { boundaryRoot: volume.serverRoot })
                try {
                    const target = path.join(to.descriptorPath, path.posix.basename(destination))
                    const exists = await lstat(target).catch((error: unknown) => { if (missing(error)) return null; throw error })
                    if (exists) throw new ConflictException(t('server-ai:Error.ProjectFileChanged'))
                    await authorize()
                    await assertWorkspaceLeases()
                    await rename(path.join(from.descriptorPath, path.posix.basename(source)), target)
                } finally { await from.fileHandle.close(); await to.fileHandle.close() }
            } finally { await opened.fileHandle.close() }
        }, 5000)
    }
}
