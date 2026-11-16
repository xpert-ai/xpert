import { Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { IntegrationModule } from '@xpert-ai/server-core'
import { ChatChannelRegistry } from '@xpert-ai/plugin-sdk'
import { AgentEventModule } from '../../agent-event/agent-event.module'
import { AgentInvocationModule } from '../../agent-invocation/agent-invocation.module'
import { OutputDispatch } from './output-dispatch'
import { OutputPreferences } from './output-preferences'

@Module({
    imports: [DiscoveryModule, IntegrationModule, AgentEventModule, AgentInvocationModule],
    providers: [ChatChannelRegistry, OutputPreferences, OutputDispatch],
    exports: [OutputPreferences, OutputDispatch]
})
export class AgentOutputModule {}
