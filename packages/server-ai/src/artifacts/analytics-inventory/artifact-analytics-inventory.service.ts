import { BadRequestException, Injectable } from '@nestjs/common'
import { t } from 'i18next'
import {
    analyticsInventoryOwners,
    analyticsInventoryDigest,
    inspectAnalyticsDocument,
    RequestContext,
    type AnalyticsInventoryFamily
} from '@xpert-ai/plugin-sdk'
import { ArtifactsService } from '../artifacts.service'
import { ArtifactDraftsService } from '../drafts/artifact-drafts.service'
import { WorkspaceFilesRuntimeCapabilityService } from '../../shared/runtime/workspace-files-runtime-capability.service'

/** Reuses management and draft ACLs; an inventory caller is never substituted for an artifact's owner. */
@Injectable()
export class ArtifactAnalyticsInventoryService {
    constructor(
        private readonly artifacts: ArtifactsService,
        private readonly drafts: ArtifactDraftsService,
        private readonly files: WorkspaceFilesRuntimeCapabilityService
    ) {}
    async version(artifactId: string, versionId: string) {
        const artifact = await this.artifacts.getArtifact(artifactId)
        const family = this.family(artifact)
        const resolved = await this.artifacts.resolveForManagementAccess({ artifactId, artifactVersionId: versionId })
        const current = await this.artifacts.getArtifact(artifactId)
        if (current.status !== 'active') throw this.invalid()
        return {
            artifactId,
            versionId,
            state: 'version' as const,
            ...inspectAnalyticsDocument(resolved.buffer, family)
        }
    }
    async draft(artifactId: string) {
        const artifact = await this.artifacts.getArtifact(artifactId)
        const family = this.family(artifact)
        // Shared/archived artifacts cannot have an editable draft for this caller.
        if (artifact.userId !== RequestContext.currentUserId() || artifact.status !== 'active')
            return { artifactId, state: 'not-editable' as const }
        const draft = await this.drafts.get(artifactId)
        if (!draft) return { artifactId, state: 'absent' as const }
        const file = await this.files.createScopedApi({}).readBuffer(draft.workspaceFileRef)
        const current = await this.drafts.get(artifactId)
        if (
            !draft.sha256 ||
            analyticsInventoryDigest(file.buffer) !== draft.sha256 ||
            current?.revision !== draft.revision
        )
            throw this.invalid()
        return {
            artifactId,
            draftId: draft.id,
            revision: draft.revision,
            baseVersionId: draft.baseVersionId,
            state: 'draft' as const,
            ...inspectAnalyticsDocument(file.buffer, family)
        }
    }
    private family(artifact: { pluginName: string; resourceType: string }): AnalyticsInventoryFamily {
        if (
            artifact.pluginName === analyticsInventoryOwners.dashboard.pluginName &&
            artifact.resourceType === analyticsInventoryOwners.dashboard.resourceType
        )
            return 'dashboard'
        if (
            artifact.pluginName === analyticsInventoryOwners.script.pluginName &&
            artifact.resourceType === analyticsInventoryOwners.script.resourceType
        )
            return 'script'
        throw this.invalid()
    }
    private invalid() {
        return new BadRequestException({
            code: 'ANALYTICS_INVENTORY_UNAVAILABLE',
            message: t('server-ai:Error.AnalyticsQueryInvalid', {
                defaultValue: 'Analytics query is unavailable or invalid'
            })
        })
    }
}
