import { DefaultModelRole, ICopilot } from '@xpert-ai/contracts'
import { IQueryHandler, QueryHandler, QueryBus } from '@nestjs/cqrs'
import { CopilotGetChatQuery } from '../get-chat-copilot.query'
import { CopilotRoleDefaultService } from '../../role-defaults/role-default.service'
import { CopilotNotFoundException } from '../../../core'
import { ResolveDefaultModelQuery } from '../resolve-default-model.query'

@QueryHandler(CopilotGetChatQuery)
export class CopilotGetChatHandler implements IQueryHandler<CopilotGetChatQuery> {
    constructor(
        private readonly queryBus: QueryBus,
        private readonly defaults: CopilotRoleDefaultService
    ) {}

    public async execute(command: CopilotGetChatQuery): Promise<ICopilot> {
        for (const role of [DefaultModelRole.Primary, DefaultModelRole.Secondary, DefaultModelRole.Reasoning]) {
            const copilot = await this.queryBus.execute<ResolveDefaultModelQuery, ICopilot>(
                new ResolveDefaultModelQuery(command.tenantId, command.organizationId, role, ['copilotModel'])
            )
            if (
                !copilot &&
                (await this.defaults.explicit(command.tenantId, command.organizationId ?? null, role)).configured
            )
                break
            if (copilot) {
                return copilot
            }
        }

        throw new CopilotNotFoundException(`Unable to find an available Copilot`)
    }
}
