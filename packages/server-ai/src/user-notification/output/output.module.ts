import { Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { IntegrationModule } from '@xpert-ai/server-core'
import { AgentEventModule } from '../../agent-event/agent-event.module'
import { AgentInvocationModule } from '../../agent-invocation/agent-invocation.module'
import { OutputDispatch } from './output-dispatch'

@Module({
    imports: [DiscoveryModule, IntegrationModule, AgentEventModule, AgentInvocationModule],
    providers: [OutputDispatch],
    exports: [AgentEventModule, OutputDispatch]
})
export class AgentOutputModule {}
