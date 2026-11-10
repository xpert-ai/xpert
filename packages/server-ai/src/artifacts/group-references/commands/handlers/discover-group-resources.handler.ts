import { HttpException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import type { ConversationResourceItem } from '@xpert-ai/contracts'
import { ArtifactGroupReferenceService } from '../../artifact-group-reference.service'
import { ArtifactTypesService } from '../../../types/artifact-types.service'
import { DiscoverGroupResourcesCommand } from '../discover-group-resources.command'

@CommandHandler(DiscoverGroupResourcesCommand)
export class DiscoverGroupResourcesHandler implements ICommandHandler<DiscoverGroupResourcesCommand> {
    constructor(
        private readonly references: ArtifactGroupReferenceService,
        private readonly types: ArtifactTypesService
    ) {}

    async execute({ actor, groupId, query }: DiscoverGroupResourcesCommand) {
        const items: ConversationResourceItem[] = []
        let offset: number | null = query.offset
        // Bounded scans preserve continuation through pages containing revoked or nonmatching references.
        for (let scan = 0; scan < 10 && offset !== null && items.length < query.limit; scan++) {
            const page = await this.references.list(actor, groupId, { offset, limit: query.limit - items.length })
            for (const reference of page.items) {
                if (query.search && !reference.title.toLocaleLowerCase().includes(query.search.toLocaleLowerCase()))
                    continue
                try {
                    const resolved = await this.references.resolve(actor, groupId, reference.id)
                    const typeId = this.types.provider(resolved.artifact).definition.contentTypeId
                    if (query.typeId && typeId !== query.typeId) continue
                    items.push({
                        resource: { kind: 'group-reference', id: reference.id },
                        title: reference.title,
                        typeId,
                        projectId: reference.runtimeProjectId,
                        publication: {
                            versionId: reference.versionId,
                            versionNumber: reference.versionNumber,
                            expiresAt: reference.expiresAt
                        },
                        access: { canOpen: true, canEdit: false, analysis: reference.analysis?.mode ?? 'none' }
                    })
                } catch (error) {
                    if (!(error instanceof HttpException) || ![403, 404, 410].includes(error.getStatus())) throw error
                }
            }
            offset = page.nextOffset
        }
        return { items, nextOffset: offset }
    }
}
