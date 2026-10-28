import { ConflictException, Injectable } from '@nestjs/common'
import { t } from 'i18next'
import {
    ContentResourceProvider,
    type IContentResourceProvider,
    type ContentCatalogProvider,
    type ContentResourceRequest,
    type ContentPrincipal
} from '@xpert-ai/plugin-sdk'
import { ArtifactLibraryService, ARTIFACT_LIBRARY_PROVIDER } from './artifact-library.service'

import { ArtifactLibraryAccess } from './artifact-library-access'
import { ArtifactTypesService } from '../types/artifact-types.service'

const model = {
    typeId: 'xpert.artifact',
    modelId: 'platform.artifact-reference',
    schemaVersion: '1',
    editProtocol: { id: 'platform.readonly-artifact', version: '1' }
}

@Injectable()
@ContentResourceProvider(ARTIFACT_LIBRARY_PROVIDER)
export class ArtifactContentProvider implements IContentResourceProvider {
    readonly title = 'Artifact references'
    constructor(
        private readonly library: ArtifactLibraryService,
        private readonly access: ArtifactLibraryAccess,
        private readonly types: ArtifactTypesService
    ) {}
    async authorize(input: ContentResourceRequest & { principal: ContentPrincipal }) {
        const row = await this.access.references.findOneBy({
            id: input.resourceId,
            tenantId: input.actor.tenantId,
            organizationId: input.actor.organizationId
        })
        if (!row) throw this.access.denied()
        const scope = { actor: input.actor, projectId: row.projectId }
        await this.library.resolve(scope, row.id, input.operation !== 'read', true)
        const access = await this.access.check(scope)
        return {
            providerKey: ARTIFACT_LIBRARY_PROVIDER,
            resourceId: row.id,
            title: row.title,
            role: access.role,
            canWrite: access.canWrite,
            canManage: access.canWrite
        }
    }
    readonly catalog: ContentCatalogProvider = {
        types: [
            {
                ...model,
                creatable: false,
                title: { en_US: 'Artifact references', zh_Hans: '成果引用' },
                implementationKey: 'platform.artifact-reference',
                implementationTitle: { en_US: 'Artifact', zh_Hans: '成果' },
                defaultEditorKey: 'platform.artifact'
            }
        ],
        discover: async (scope) => {
            await this.access.check(scope)
            const offset = Number(scope.cursor ?? 0)
            if (!Number.isSafeInteger(offset) || offset < 0) throw this.access.denied()
            const rows = await this.access.references.find({
                where: this.access.where(scope),
                order: { id: 'ASC' },
                skip: offset,
                take: 100
            })
            return {
                resourceIds: rows.map((row) => row.id),
                ...(rows.length === 100 ? { nextCursor: String(offset + 100) } : {})
            }
        },
        describe: async (input) => {
            const { reference, artifact } = await this.library.resolve(input, input.sourceResourceId, false, true)
            return {
                ...model,
                projectId: reference.projectId,
                title: reference.title,
                revision: String(reference.revision),
                updatedAt: reference.updatedAt.toISOString(),
                deleted: reference.deleted,
                source: { kind: 'managed' },
                presentation: { kind: 'artifact', referenceId: reference.id, type: this.types.describe(artifact) },
                defaultEditorKey: 'platform.artifact',
                allowedActions: ['rename', 'trash', 'restore']
            }
        },
        create: async () => {
            throw this.access.denied()
        },
        mutate: async (input) => {
            const { reference } = await this.library.resolve(input, input.sourceResourceId, true, true)
            if (!['rename', 'trash', 'restore'].includes(input.change.action)) throw this.access.denied()
            if (String(reference.revision) !== input.expectedRevision)
                throw new ConflictException(t('server-ai:Error.ContentOperationInvalid'))
            const patch =
                input.change.action === 'rename'
                    ? { title: input.change.title }
                    : { deleted: input.change.action === 'trash' }
            const result = await this.access.references.update(
                { id: reference.id, revision: reference.revision },
                { ...patch, revision: reference.revision + 1 }
            )
            if (result.affected !== 1) throw new ConflictException(t('server-ai:Error.ContentOperationInvalid'))
            return { providerKey: ARTIFACT_LIBRARY_PROVIDER, resourceId: reference.id }
        }
    }
}
