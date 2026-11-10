import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import type { ChatGroupResourceLink } from '@xpert-ai/contracts'
import { ArtifactGroupReferenceService } from '../../artifact-group-reference.service'
import { GroupResourceNavigationCommand } from '../group-resource-navigation.command'

@CommandHandler(GroupResourceNavigationCommand)
export class GroupResourceNavigationHandler implements ICommandHandler<GroupResourceNavigationCommand> {
    constructor(private readonly references: ArtifactGroupReferenceService) {}
    async execute({ actor, groupId, input }: GroupResourceNavigationCommand) {
        const link = (
            reference: Awaited<ReturnType<ArtifactGroupReferenceService['resolve']>>['descriptor']
        ): ChatGroupResourceLink => ({
            resource: { kind: 'group-reference', id: reference.id },
            projectId: reference.runtimeProjectId,
            title: reference.title
        })
        if ('referenceIds' in input)
            return {
                items: await Promise.all(
                    input.referenceIds.map(async (id) =>
                        link((await this.references.resolve(actor, groupId, id)).descriptor)
                    )
                ),
                hasMore: false
            }
        const items: ChatGroupResourceLink[] = []
        let offset: number | null = 0
        do {
            const page = await this.references.list(actor, groupId, { offset, limit: 100 })
            items.push(
                ...page.items
                    .filter((item) => item.title.toLocaleLowerCase().includes(input.query.toLocaleLowerCase()))
                    .map(link)
            )
            offset = page.nextOffset
        } while (offset !== null && items.length <= input.offset + 10)
        return {
            items: items.slice(input.offset, input.offset + 10),
            hasMore: items.length > input.offset + 10 || offset !== null
        }
    }
}
