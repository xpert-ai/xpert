import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import type { ChatGroupResourceLink } from '@xpert-ai/contracts'
import { ArtifactGroupReferenceService } from '../../artifact-group-reference.service'
import { GroupResourceNavigationCommand } from '../group-resource-navigation.command'
import { ArtifactTypesService } from '../../../types/artifact-types.service'

@CommandHandler(GroupResourceNavigationCommand)
export class GroupResourceNavigationHandler implements ICommandHandler<GroupResourceNavigationCommand> {
    constructor(
        private readonly references: ArtifactGroupReferenceService,
        private readonly types: ArtifactTypesService
    ) {}
    async execute({ actor, groupId, input }: GroupResourceNavigationCommand) {
        const link = async (id: string): Promise<ChatGroupResourceLink> => {
            const { descriptor: reference, artifact } = await this.references.resolve(actor, groupId, id)
            const icon = this.types.provider(artifact).definition.icon
            return {
                resource: { kind: 'group-reference', id: reference.id },
                projectId: reference.runtimeProjectId,
                title: reference.title,
                ...(icon ? { icon } : {})
            }
        }
        if ('referenceIds' in input)
            return {
                items: await Promise.all(input.referenceIds.map(link)),
                hasMore: false
            }
        const items: Array<{ id: string }> = []
        let offset: number | null = 0
        do {
            const page = await this.references.list(actor, groupId, { offset, limit: 100 })
            items.push(
                ...page.items.filter((item) => item.title.toLocaleLowerCase().includes(input.query.toLocaleLowerCase()))
            )
            offset = page.nextOffset
        } while (offset !== null && items.length <= input.offset + 10)
        return {
            items: await Promise.all(items.slice(input.offset, input.offset + 10).map((item) => link(item.id))),
            hasMore: items.length > input.offset + 10 || offset !== null
        }
    }
}
