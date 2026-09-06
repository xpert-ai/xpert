import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
    KnowledgebaseProvisioningRuntimeCapability,
    type KnowledgebaseProvisioningApi,
    KnowledgebaseConnectAgentInput,
    KnowledgebaseConnectAgentResult,
    KnowledgebaseEnsureInput,
    KnowledgebaseEnsureResult
} from '@xpert-ai/plugin-sdk'
import { EnsureKnowledgebasesCommand } from '../commands'
import { ConnectAgentKnowledgebasesCommand } from '../../xpert-agent/commands'
import { RuntimeCapabilityProvider } from '../../shared/runtime/runtime-capability-provider.decorator'

@Injectable()
@RuntimeCapabilityProvider(KnowledgebaseProvisioningRuntimeCapability)
export class KnowledgebaseProvisioningRuntimeService implements KnowledgebaseProvisioningApi {
    constructor(private readonly commandBus: CommandBus) {}

    async ensure(input: KnowledgebaseEnsureInput): Promise<KnowledgebaseEnsureResult> {
        return this.commandBus.execute(new EnsureKnowledgebasesCommand(input))
    }

    async connectAgent(input: KnowledgebaseConnectAgentInput): Promise<KnowledgebaseConnectAgentResult> {
        return this.commandBus.execute(new ConnectAgentKnowledgebasesCommand(input))
    }
}
