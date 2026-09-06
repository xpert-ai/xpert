import type { Type } from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { CopilotModelModule } from '../../../copilot-model/copilot-model.module'
import { XpertAgentModule } from '../../../xpert-agent/xpert-agent.module'
import { XpertAgentExecutionModule } from '../../../xpert-agent-execution/agent-execution.module'
import { AgentMiddlewareRuntimeModule } from './middleware-runtime.module'
import { AgentMiddlewareRuntimeService } from './middleware-runtime.service'
import { WorkspaceFilesRuntimeModule } from '../../runtime/workspace-files-runtime.module'
import { WorkspaceFilesRuntimeCapabilityService } from '../../runtime/workspace-files-runtime-capability.service'
import { FileRuntimeModule } from '../../../file-understanding/runtime/file-runtime.module'
import { FileRuntimeService } from '../../../file-understanding/runtime/file-runtime.service'
import { FileUnderstandingModule } from '../../../file-understanding/file-understanding.module'
import { SandboxModule } from '../../../sandbox/sandbox.module'
import { XpertModule } from '../../../xpert/xpert.module'
import { ActorTokenRuntimeModule } from '../../../actor-token/actor-token-runtime.module'
import { ActorTokenRuntimeService } from '../../../actor-token/actor-token-runtime.service'
import { ConnectorModule } from '../../../connector/connector.module'
import { ConnectorService } from '../../../connector/connector.service'
import { KnowledgeDocumentModule } from '../../../knowledge-document/document.module'
import { KnowledgeDocumentVisualAssetsRuntimeService } from '../../../knowledge-document/visual-assets-runtime.service'

const modulesThatConsumeRuntime: Type<unknown>[] = [CopilotModelModule, XpertAgentExecutionModule, XpertAgentModule]

describe('AgentMiddlewareRuntime provider boundary', () => {
    it('uses the runtime module instead of recreating the runtime service in feature modules', () => {
        for (const moduleType of modulesThatConsumeRuntime) {
            const providers = getModuleMetadata(moduleType, MODULE_METADATA.PROVIDERS)
            const imports = getModuleMetadata(moduleType, MODULE_METADATA.IMPORTS)

            expect(providers).not.toContain(AgentMiddlewareRuntimeService)
            expect(imports).toContain(AgentMiddlewareRuntimeModule)
        }
    })

    it('gives file capabilities one independent provider owner and imports it at each consumer', () => {
        expect(getModuleMetadata(WorkspaceFilesRuntimeModule, MODULE_METADATA.PROVIDERS)).toContain(
            WorkspaceFilesRuntimeCapabilityService
        )
        expect(getModuleMetadata(FileRuntimeModule, MODULE_METADATA.PROVIDERS)).toContain(FileRuntimeService)
        for (const consumer of [AgentMiddlewareRuntimeModule, SandboxModule, XpertModule]) {
            expect(getModuleMetadata(consumer, MODULE_METADATA.IMPORTS)).toContain(WorkspaceFilesRuntimeModule)
            expect(getModuleMetadata(consumer, MODULE_METADATA.PROVIDERS)).not.toContain(
                WorkspaceFilesRuntimeCapabilityService
            )
        }
        for (const consumer of [AgentMiddlewareRuntimeModule, FileUnderstandingModule]) {
            expect(getModuleMetadata(consumer, MODULE_METADATA.IMPORTS)).toContain(FileRuntimeModule)
            expect(getModuleMetadata(consumer, MODULE_METADATA.PROVIDERS)).not.toContain(FileRuntimeService)
        }
        expect(getModuleMetadata(SandboxModule, MODULE_METADATA.IMPORTS)).not.toContain(AgentMiddlewareRuntimeModule)
    })

    it('owns scoped factories in domain modules instead of recreating them in the Agent module', () => {
        const domains = [
            [ActorTokenRuntimeModule, ActorTokenRuntimeService],
            [ConnectorModule, ConnectorService],
            [KnowledgeDocumentModule, KnowledgeDocumentVisualAssetsRuntimeService]
        ] as const
        for (const [moduleType, provider] of domains) {
            expect(getModuleMetadata(moduleType, MODULE_METADATA.PROVIDERS)).toContain(provider)
            expect(getModuleMetadata(AgentMiddlewareRuntimeModule, MODULE_METADATA.PROVIDERS)).not.toContain(provider)
        }
    })
})

function getModuleMetadata(moduleType: Type<unknown>, key: string): unknown[] {
    const metadata: unknown = Reflect.getMetadata(key, moduleType)
    return Array.isArray(metadata) ? metadata : []
}
