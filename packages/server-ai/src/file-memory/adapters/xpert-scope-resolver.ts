import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/server-core'
import { XpertService } from '../../xpert/xpert.service'
import { FileMemoryXpertScope, FileMemoryXpertScopeResolver } from '../ports'
import { ResolveAssistantWorkspaceScopeCommand } from '../../xpert/assistant-files/resolve-assistant-workspace-scope.command'

@Injectable()
export class XpertFileMemoryScopeResolver implements FileMemoryXpertScopeResolver {
    constructor(
        private readonly xpertService: XpertService,
        private readonly commandBus: CommandBus
    ) {}

    async resolve(xpertId: string): Promise<FileMemoryXpertScope> {
        const xpert = await this.xpertService.findOne(xpertId)
        if (!xpert.tenantId) {
            throw new Error(`Missing tenantId for xpert file memory: ${xpert.id}`)
        }
        const scope = await this.commandBus.execute(
            new ResolveAssistantWorkspaceScopeCommand({
                tenantId: xpert.tenantId,
                xpertId: xpert.id,
                userId: RequestContext.currentUserId(),
                workspaceDataScope: xpert.workspaceDataScope
            })
        )
        return {
            id: xpert.id,
            tenantId: xpert.tenantId,
            userId: RequestContext.currentUserId(),
            workspaceUserId: scope.userId,
            workspaceDataScope: xpert.workspaceDataScope
        }
    }
}
