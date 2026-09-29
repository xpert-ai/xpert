import { Inject, Injectable } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { ArtifactsRuntimeCapability, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { WorkspaceFilesRuntimeCapabilityService } from '../../shared/runtime/workspace-files-runtime-capability.service'
import { getArtifactArchiveMimeType } from '../../artifacts/artifact-mime-policy'

/** Host-owned archive: never give the Agent a file API with a broader workspace scope. */
@Injectable()
export class FileActivityStorage {
    constructor(
        @Inject(WorkspaceFilesRuntimeCapabilityService)
        private readonly files: Pick<WorkspaceFilesRuntimeCapabilityService, 'uploadBuffer'>
    ) {}
    /** Copy into a private user volume outside the mutable sandbox; register no share link. */
    async persist(
        context: IAgentMiddlewareContext,
        resourceType: string,
        resourceId: string,
        name: string,
        mimeType: string,
        buffer: Buffer
    ) {
        const files = this.files
        const artifacts = context.runtime.capabilities?.get(ArtifactsRuntimeCapability)
        if (!files || !artifacts)
            throw new Error('File delivery requires workspace files and artifacts runtime capabilities.')
        const sha256 = createHash('sha256').update(buffer).digest('hex')
        const artifact = await artifacts.createArtifact({
            source: { pluginName: 'platform.file-activity', resourceType, resourceId },
            kind: 'file',
            title: name
        })
        const previous = await artifacts.listArtifactVersions({ artifactId: artifact.id, idempotencyKey: sha256 })
        if (previous[0])
            return { artifactId: artifact.id, artifactVersionId: previous[0].id, sha256, size: buffer.length }
        const archiveMimeType = getArtifactArchiveMimeType(mimeType)
        const file = await files.uploadBuffer({
            catalog: 'users',
            userId: context.userId,
            scopeId: context.userId,
            tenantId: context.tenantId,
            organizationId: context.organizationId,
            folder: `artifact-snapshots/${randomUUID()}`,
            originalName: name,
            mimeType: archiveMimeType,
            buffer
        })
        const { version } = await artifacts.ensureArtifactVersion({
            artifactId: artifact.id,
            idempotencyKey: sha256,
            fileName: name,
            mimeType: archiveMimeType,
            size: buffer.length,
            sha256,
            workspaceFileRef: {
                source: 'platform.workspace.files',
                catalog: 'users',
                userId: context.userId,
                scopeId: context.userId,
                tenantId: context.tenantId,
                organizationId: context.organizationId,
                filePath: file.filePath,
                workspacePath: file.workspacePath,
                originalName: name,
                mimeType: archiveMimeType,
                size: buffer.length
            }
        })
        return { artifactId: artifact.id, artifactVersionId: version.id, sha256, size: buffer.length }
    }
}
