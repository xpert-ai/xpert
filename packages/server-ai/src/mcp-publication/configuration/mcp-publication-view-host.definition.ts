import { Injectable } from '@nestjs/common'
import { RolesEnum, type McpPublicationViewHostSnapshot, type XpertViewSlot } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ViewHostDefinition, type ViewHostDefinitionContract } from '@xpert-ai/server-core'
import { McpSourceConfigurationService } from './configuration.service'

@Injectable()
@ViewHostDefinition('mcp-publication')
export class McpPublicationViewHostDefinition implements ViewHostDefinitionContract {
    readonly hostType = 'mcp-publication'
    readonly slots: XpertViewSlot[] = [{ key: 'detail.main_tabs', mode: 'tabs', order: 0 }]

    constructor(private readonly configurations: McpSourceConfigurationService) {}

    async resolve(hostId: string) {
        const sources = await this.configurations.sources(hostId)
        const hostSnapshot: McpPublicationViewHostSnapshot = { id: hostId, sources }
        return {
            hostSnapshot,
            context: {
                // Binding changes invalidate cached manifests without putting credentials in the view context.
                hostState: { mcpSources: sources }
            }
        }
    }

    canRead() {
        return RequestContext.hasRole(RolesEnum.SUPER_ADMIN)
    }
}
