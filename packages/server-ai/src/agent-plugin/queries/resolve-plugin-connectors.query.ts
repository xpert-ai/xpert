import { Query } from '@nestjs/cqrs'
import type { ConnectorStrategyRuntime } from '@xpert-ai/plugin-sdk'
import type { AgentPluginScope } from '../agent-plugin-scope'

/** Resolve imported MCP OAuth providers in a trusted scope; callers retain resource and credential authorization. */
export class ResolvePluginConnectorsQuery extends Query<ConnectorStrategyRuntime[]> {
    constructor(
        readonly scope: AgentPluginScope,
        readonly workspaceId?: string,
        readonly provider?: string
    ) {
        super()
    }
}
