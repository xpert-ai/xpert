import { Injectable } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertService } from '../../xpert/xpert.service'
import { FileMemoryXpertScope, FileMemoryXpertScopeResolver } from '../../plugins/file-memory/ports'

@Injectable()
export class XpertFileMemoryScopeResolver implements FileMemoryXpertScopeResolver {
    constructor(private readonly xpertService: XpertService) {}

    async resolve(xpertId: string): Promise<FileMemoryXpertScope> {
        const xpert = await this.xpertService.findOne(xpertId)
        if (!xpert.tenantId) {
            throw new Error(`Missing tenantId for xpert file memory: ${xpert.id}`)
        }
        return {
            id: xpert.id,
            tenantId: xpert.tenantId,
            organizationId: RequestContext.getOrganizationId(),
            userId: RequestContext.currentUserId(),
            workspaceDataScope: xpert.workspaceDataScope
        }
    }
}
