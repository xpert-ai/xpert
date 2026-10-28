import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { ArtifactLibraryScope } from '@xpert-ai/plugin-sdk'
import type { ArtifactLibraryView, ArtifactPresentationQuery } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { ArtifactLibraryService } from './artifact-library.service'
import { ArtifactLibraryAccess } from './artifact-library-access'
import { ArtifactsService } from '../artifacts.service'
import { ArtifactTypesService } from '../types/artifact-types.service'
import { ArtifactTypeViews } from '../types/artifact-type-views'
import { ArtifactPresentationService } from '../presentation/artifact-presentation.service'
import { runWithCapturedRequestContext } from '../../shared/request-context'

@Injectable()
export class ArtifactLibraryViewService {
    constructor(
        private readonly library: ArtifactLibraryService,
        private readonly access: ArtifactLibraryAccess,
        private readonly artifacts: ArtifactsService,
        private readonly types: ArtifactTypesService,
        private readonly views: ArtifactTypeViews,
        private readonly presentations: ArtifactPresentationService
    ) {}
    async scope(id: string): Promise<ArtifactLibraryScope> {
        const actor = {
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId(),
            userId: RequestContext.currentUserId()
        }
        if (!actor.userId || !actor.tenantId || !actor.organizationId) throw this.access.denied()
        const row = await this.access.references.findOneBy({
            id,
            tenantId: actor.tenantId,
            organizationId: actor.organizationId
        })
        if (!row) throw new NotFoundException(t('server-ai:Error.ArtifactNotFound'))
        const scope = { actor, projectId: row.projectId }
        await this.access.check(scope)
        return scope
    }
    private async content(id: string) {
        const scope = await this.scope(id)
        const selected = await this.library.resolve(scope, id)
        const content = await this.artifacts.readArtifactVersion(
            {
                artifactId: selected.reference.artifactId,
                artifactVersionId: selected.reference.versionId,
                purpose: 'view'
            },
            scope.actor
        )
        return { ...selected, scope, content }
    }
    async read(id: string): Promise<ArtifactLibraryView> {
        const { reference, scope, content } = await this.content(id)
        const provider = this.types.provider(content.artifact)
        let view: ArtifactLibraryView['content']
        if (provider.definition.presentation.mode === 'snapshot') {
            if (!provider.snapshot) throw new NotFoundException(t('server-ai:Error.ArtifactPresentationUnavailable'))
            const snapshot = provider.snapshot
            const { data, entry } = await runWithCapturedRequestContext({ user: null, headers: {} }, async () => ({
                data: await snapshot.read({
                    source: content.artifact,
                    viewer: { kind: 'authenticated', actor: scope.actor },
                    content: content.buffer
                }),
                entry: snapshot.kind === 'plugin' ? await snapshot.getEntry() : null
            }))
            view = entry
                ? {
                      kind: 'presentation',
                      presentation: {
                          schemaVersion: 1,
                          target: { artifactId: content.artifact.id, versionId: content.version.id },
                          title: reference.title,
                          versionNumber: content.version.versionNumber,
                          readOnly: true,
                          entry,
                          data,
                          operations: []
                      }
                  }
                : this.views.read(content.artifact.typeBinding, data)
            if (!view) throw new NotFoundException(t('server-ai:Error.ArtifactPresentationUnavailable'))
        } else if (provider.definition.presentation.mode === 'authenticated') {
            view = { kind: 'presentation', presentation: await this.presentations.readVersion(content) }
        } else
            view = {
                kind: 'file',
                fileName: content.fileName,
                mimeType: content.mimeType,
                canDownload: provider.definition.collection?.allowCopy === true
            }
        await this.recheck(scope, id, reference.revision)
        if (this.types.provider(content.artifact) !== provider) throw new ConflictException()
        return { title: reference.title, revision: reference.revision, content: view }
    }
    async query(id: string, query: ArtifactPresentationQuery) {
        const { reference, scope, content } = await this.content(id)
        const result = await this.presentations.queryVersion(content, query)
        await this.recheck(scope, id, reference.revision)
        return result
    }
    async preview(id: string, expectedRevision?: number) {
        const { scope, reference, content } = await this.content(id)
        if (expectedRevision !== undefined && reference.revision !== expectedRevision)
            throw new ConflictException(t('server-ai:Error.ContentOperationInvalid'))
        if (this.types.provider(content.artifact).definition.presentation.mode !== 'file')
            throw new NotFoundException(t('server-ai:Error.ArtifactPresentationUnavailable'))
        await this.recheck(scope, id, reference.revision)
        return content
    }
    async download(id: string) {
        const { scope, reference } = await this.content(id)
        const result = await this.artifacts.readArtifactVersion(
            { artifactId: reference.artifactId, artifactVersionId: reference.versionId, purpose: 'copy' },
            scope.actor
        )
        await this.recheck(scope, id, reference.revision)
        return result
    }
    private async recheck(scope: ArtifactLibraryScope, id: string, revision: number) {
        const current = await this.library.resolve(scope, id)
        if (current.reference.revision !== revision)
            throw new ConflictException(t('server-ai:Error.ContentOperationInvalid'))
    }
}
