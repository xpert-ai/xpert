import { ForbiddenException } from '@nestjs/common'
import type { CommandBus } from '@nestjs/cqrs'
import type { ExecutionReviewApi } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { AssertProjectAssistantAccessCommand } from '../../xpert-project/commands/assert-project-assistant-access.command'

export interface ExecutionReviewScope {
    tenantId: string
    organizationId: string
    userId: string
    projectId: string
    xpertId: string
}

/** A bound API can outlive a role change. Revalidate each operation before touching case data. */
export function bindExecutionReviewAccess(
    commands: CommandBus,
    scope: ExecutionReviewScope,
    operations: ExecutionReviewApi
): ExecutionReviewApi {
    async function authorize() {
        if (
            RequestContext.currentTenantId() !== scope.tenantId ||
            RequestContext.getOrganizationId() !== scope.organizationId ||
            RequestContext.currentUserId() !== scope.userId
        )
            throw new ForbiddenException()
        await commands.execute(new AssertProjectAssistantAccessCommand(scope.projectId, scope.xpertId, 'manage'))
    }
    return {
        async list(target, query) {
            await authorize()
            return operations.list(target, query)
        },
        async get(target, executionId) {
            await authorize()
            return operations.get(target, executionId)
        },
        async submit(target, input) {
            await authorize()
            return operations.submit(target, input)
        }
    }
}
