import { CommandBus } from '@nestjs/cqrs'
import { DeleteFileAssetCommand } from '../../file-understanding/commands/delete-file-asset.command'
import { BadRequestException, ForbiddenException, Inject, Injectable, ConflictException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import path from 'node:path'
import { t } from 'i18next'
import { FileAsset } from '../../file-understanding/entities/file-asset.entity'
import { VOLUME_CLIENT, VolumeClient, VolumeHandle } from '../../shared/volume'
import { XpertProjectAccessService } from './project-access.service'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectTypeService } from './project-type.service'
import { ConnectorService } from '../../connector/connector.service'
import { deleteProjectRecord } from './purge/delete-project-record'
import {
    admitProjectPurge,
    assertProjectRestorable,
    finishProjectPurge,
    purgeScope,
    type ProjectPurgeInput
} from './purge/project-purge-receipt'

/** Owner-only cleanup for archived, one-to-one plugin project workspaces. */
@Injectable()
export class XpertProjectPurgeService {
    constructor(
        private readonly access: XpertProjectAccessService,
        private readonly types: XpertProjectTypeService,
        private readonly connectors: ConnectorService,
        private readonly commands: CommandBus,
        @InjectRepository(FileAsset) private readonly files: Repository<FileAsset>,
        @Inject(VOLUME_CLIENT) private readonly volumes: VolumeClient
    ) {}

    assertRestorable(input: ProjectPurgeInput) {
        return assertProjectRestorable(this.files.manager, input)
    }

    async purge(input: ProjectPurgeInput) {
        const scope = purgeScope(input)
        const { projectId, tenantId, organizationId, ownerId } = scope
        await admitProjectPurge(this.files.manager, scope, async (manager) => {
            const projects = manager.getRepository(XpertProject)
            const project = await projects.findOne({
                where: { id: projectId, tenantId, organizationId: organizationId ?? IsNull(), ownerId },
                lock: { mode: 'pessimistic_write' }
            })
            if (!project) throw new ForbiddenException(t('server-ai:Error.ProjectNotAvailable'))
            await this.access.assertCanPurge(projectId)
            if (!(await projects.exists({ where: { id: projectId, xperts: { id: scope.xpertId } } }))) {
                throw new ForbiddenException(
                    t('server-ai:Error.ProjectPurgeBindingInvalid', {
                        defaultValue: 'Project is not bound to the requesting Assistant.'
                    })
                )
            }
            await this.types.assertProvisionedPurge(project, scope.xpertId)
            await this.readyAssets(tenantId, projectId)
        })
        await finishProjectPurge(
            this.files.manager,
            scope,
            () => this.cleanWorkspace(tenantId, ownerId, projectId),
            async (manager) => {
                const result = await deleteProjectRecord(manager, this.connectors, {
                    id: projectId,
                    tenantId,
                    organizationId
                })
                if (result.affected !== 1) throw new ConflictException(t('server-ai:Error.ProjectNotAvailable'))
            }
        )
        return { projectId, deleted: true }
    }

    private async readyAssets(tenantId: string, projectId: string) {
        const assets = await this.files.find({ where: { tenantId, projectId }, select: { id: true, status: true } })
        if (
            assets.some((asset) => ['uploaded', 'scanning', 'parsing', 'processing', 'queued'].includes(asset.status))
        ) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectPurgeBusy', {
                    defaultValue: 'Wait for file processing to stop before permanently deleting the Project.'
                })
            )
        }
        return assets
    }

    private async cleanWorkspace(tenantId: string, ownerId: string, projectId: string) {
        const assets = await this.readyAssets(tenantId, projectId)
        for (const asset of assets)
            await this.commands.execute(new DeleteFileAssetCommand(asset.id, { purgeProjectId: projectId }))
        const volume = this.volumes.resolve({
            tenantId,
            userId: ownerId,
            catalog: 'projects',
            projectId
        })
        await volume
            .withRemovalBudget(() =>
                VolumeHandle.removePath(path.dirname(volume.serverRoot), path.basename(volume.serverRoot), {
                    boundaryRoot: this.volumes.resolveRoot(tenantId).serverRoot
                })
            )
            .catch((error: unknown) => {
                if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
            })
    }
}
