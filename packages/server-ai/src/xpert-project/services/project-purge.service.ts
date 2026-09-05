import { ModuleRef } from '@nestjs/core'
import { FileAssetDeletionService } from '../../file-understanding/file-asset-deletion.service'
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import path from 'node:path'
import { t } from 'i18next'
import { FileAsset } from '../../file-understanding/entities/file-asset.entity'
import { VOLUME_CLIENT, VolumeClient, VolumeHandle } from '../../shared/volume'
import { XpertProjectAccessService } from './project-access.service'
import { XpertProjectService } from '../project.service'

/** Owner-only cleanup for archived, one-to-one plugin project workspaces. */
@Injectable()
export class XpertProjectPurgeService {
    constructor(
        private readonly access: XpertProjectAccessService,
        private readonly projects: XpertProjectService,
        private readonly moduleRef: ModuleRef,
        @InjectRepository(FileAsset) private readonly files: Repository<FileAsset>,
        @Inject(VOLUME_CLIENT) private readonly volumes: VolumeClient
    ) {}

    async purge(input: { projectId: string; xpertId: string }) {
        const access = await this.access.assertCanPurge(input.projectId).catch((error: unknown) => {
            if (error instanceof NotFoundException) return null
            throw error
        })
        if (!access) return { projectId: input.projectId, deleted: true }
        const { project } = access
        const linked = await this.projects.findOne(input.projectId, { relations: ['xperts'] })
        if (!linked.xperts?.some((agent) => agent.id === input.xpertId)) {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectPurgeBindingInvalid', {
                    defaultValue: 'Project is not bound to the requesting Assistant.'
                })
            )
        }
        const assets = await this.files.find({ where: { tenantId: project.tenantId, projectId: project.id } })
        if (
            assets.some((asset) => ['uploaded', 'scanning', 'parsing', 'processing', 'queued'].includes(asset.status))
        ) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectPurgeBusy', {
                    defaultValue: 'Wait for file processing to stop before permanently deleting the Project.'
                })
            )
        }
        const deletion = this.moduleRef.get(FileAssetDeletionService, { strict: false })
        for (const asset of assets) await deletion.purgeProjectFile(asset.id, project.id)
        const volume = this.volumes.resolve({
            tenantId: project.tenantId,
            userId: project.ownerId,
            catalog: 'projects',
            projectId: project.id
        })
        await VolumeHandle.removePath(path.dirname(volume.serverRoot), path.basename(volume.serverRoot), {
            boundaryRoot: this.volumes.resolveRoot(project.tenantId).serverRoot
        }).catch((error: unknown) => {
            if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
        })
        await this.projects.deleteProject(project.id)
        return { projectId: project.id, deleted: true }
    }
}
