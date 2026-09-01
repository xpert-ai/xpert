import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { t } from 'i18next'
import {
    isProjectGovernedContentPath,
    VOLUME_CLIENT,
    VolumeClient,
    VolumeSubtreeClient
} from '../../shared/volume'
import { XpertProjectAccessService } from './project-access.service'
import { XpertProjectContentService } from './project-content.service'

@Injectable()
export class XpertProjectWorkspaceFilesService {
    constructor(
        private readonly accessService: XpertProjectAccessService,
        private readonly contentService: XpertProjectContentService,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: Pick<VolumeClient, 'resolve'>
    ) {}

    async list(projectId: string, filePath?: string, deepth?: number) {
        const client = await this.createReadClient(projectId)
        return client.list('', { path: filePath, deepth })
    }

    async read(projectId: string, filePath: string) {
        const client = await this.createReadClient(projectId)
        return client.readFile('', filePath)
    }

    async save(projectId: string, filePath: string, content: string) {
        const normalizedPath = normalizeProjectWorkspacePath(filePath)
        if (normalizedPath === 'project.md') {
            await this.contentService.updateInstructions(projectId, content)
            return (await this.createReadClient(projectId)).readFile('', normalizedPath)
        }
        if (normalizedPath.startsWith('skills/')) {
            await this.contentService.writeSkillFile(projectId, normalizedPath, content)
            return (await this.createReadClient(projectId)).readFile('', normalizedPath)
        }

        const client = await this.createEditClient(projectId)
        return client.saveFile('', normalizedPath, content)
    }

    async uploadToFolder(
        projectId: string,
        folderPath: string,
        file: { originalname: string; buffer: Buffer; mimetype?: string }
    ) {
        const normalizedFolder = normalizeProjectWorkspacePath(folderPath, true)
        if (isProjectGovernedContentPath(normalizedFolder || file.originalname)) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectContentApiRequired', {
                    defaultValue: 'Use Project configuration to modify project.md or Project skills'
                })
            )
        }
        const client = await this.createEditClient(projectId)
        return client.uploadFile('', normalizedFolder, file)
    }

    async delete(projectId: string, filePath: string) {
        const normalizedPath = normalizeProjectWorkspacePath(filePath)
        if (normalizedPath === 'project.md') {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectInstructionsCannotBeDeleted', {
                    defaultValue: 'Project instructions cannot be deleted'
                })
            )
        }
        if (normalizedPath === 'skills' || normalizedPath.startsWith('skills/')) {
            return this.contentService.deleteSkillPath(projectId, normalizedPath)
        }

        const client = await this.createEditClient(projectId)
        await client.deleteFile('', normalizedPath)
    }

    private async createReadClient(projectId: string) {
        const { project } = await this.accessService.assertCanRead(projectId)
        return this.createClient(projectId, project)
    }

    private async createEditClient(projectId: string) {
        const { project } = await this.accessService.assertCanEdit(projectId)
        return this.createClient(projectId, project)
    }

    private async createClient(projectId: string, project: { tenantId?: string; ownerId?: string }) {
        const { tenantId, ownerId } = project
        if (!tenantId || !ownerId) {
            throw new Error(`Project ${projectId} is missing its storage identity`)
        }
        await this.contentService.initializeById(projectId)
        const volume = this.volumeClient.resolve({
            tenantId,
            userId: ownerId,
            catalog: 'projects',
            projectId
        })
        return new VolumeSubtreeClient(volume, { allowRootWorkspace: true })
    }
}

function normalizeProjectWorkspacePath(filePath: string | null | undefined, allowEmpty = false) {
    const normalized = (filePath ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
    if (!normalized && allowEmpty) {
        return ''
    }
    if (!normalized) {
        throw new BadRequestException(
            t('server-ai:Error.WorkspaceFilePathRequired', { defaultValue: 'Workspace file path is required' })
        )
    }
    return normalized
}
