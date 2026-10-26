import { QueryHandler, IQueryHandler } from '@nestjs/cqrs'
import { AuthorizeAssistantMcpQuery } from '../../mcp-consumer/execution/mcp-operation-authority'
import { PublishedXpertAccessService } from '../published-xpert-access.service'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertProjectService } from '../../xpert-project/project.service'
import { McpControlError } from '../../mcp-consumer/execution/mcp-control.error'

@QueryHandler(AuthorizeAssistantMcpQuery)
export class AuthorizeAssistantMcpHandler implements IQueryHandler<AuthorizeAssistantMcpQuery> {
    constructor(
        private readonly published: PublishedXpertAccessService,
        private readonly workspaces: XpertWorkspaceAccessService,
        private readonly projects: XpertProjectService
    ) {}
    async execute(query: AuthorizeAssistantMcpQuery) {
        if (query.projectId) await this.projects.assertRuntimeAccess(query.projectId, query.xpertId)
        try {
            const assistant = await this.published.getAccessiblePublishedXpert(query.xpertId)
            if (assistant.workspaceId !== query.workspaceId) throw new McpControlError('scope')
        } catch (error) {
            if (query.projectId || error instanceof McpControlError) throw error
            // Studio/draft execution retains its existing authoring authority.
            await this.workspaces.assertCanAuthor(query.workspaceId)
        }
    }
}
