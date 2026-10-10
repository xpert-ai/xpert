import { TenantLibraryAccessService } from '../../tenant-library/tenant-library-access.service'
import { Logger, Optional } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/server-core'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { ListWorkspaceKnowledgebasesQuery } from '../list-workspace-knowledgebases.query'

@QueryHandler(ListWorkspaceKnowledgebasesQuery)
export class ListWorkspaceKnowledgebasesHandler implements IQueryHandler<ListWorkspaceKnowledgebasesQuery> {
    private readonly logger = new Logger(ListWorkspaceKnowledgebasesHandler.name)

    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        @Optional() private readonly tenantLibraries?: TenantLibraryAccessService
    ) {}

    public async execute(command: ListWorkspaceKnowledgebasesQuery) {
        const workspaceId = command.input.workspaceId?.trim()
        if (!workspaceId && command.input.scope !== 'tenant') {
            return []
        }

        const user = RequestContext.currentUser()
        if (!user?.id) {
            this.logger.warn('Cannot list workspace knowledgebases without an authenticated user.')
            return []
        }

        const result =
            command.input.scope === 'tenant'
                ? { items: await this.tenantLibraries!.list() }
                : await this.knowledgebaseService.getAllByWorkspace(
                      workspaceId,
                      {
                          order: {
                              updatedAt: 'DESC'
                          },
                          take: normalizeKnowledgebaseListLimit(command.input.limit)
                      } as any,
                      Boolean(command.input.published),
                      user
                  )

        return (result.items ?? [])
            .filter((item) => typeof item.id === 'string' && item.id.trim())
            .map((item) => ({
                id: item.id,
                name: item.name,
                description: item.description ?? null,
                applicationTags: item.applicationTags ?? [],
                type: item.type ?? null,
                status: item.status ?? null,
                permission: item.permission ?? null,
                workspaceId: item.workspaceId ?? null,
                documentNum: item.documentNum ?? null,
                chunkNum: item.chunkNum ?? null,
                graphRag: item.graphRag ?? null,
                graphStatus: item.graphStatus ?? null
            }))
    }
}

function normalizeKnowledgebaseListLimit(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.min(Math.max(Math.floor(value), 1), 500)
    }
    return 100
}
