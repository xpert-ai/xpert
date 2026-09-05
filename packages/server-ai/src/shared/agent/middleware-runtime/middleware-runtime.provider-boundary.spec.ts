import type { Type } from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { CopilotModelModule } from '../../../copilot-model/copilot-model.module'
import { XpertAgentModule } from '../../../xpert-agent/xpert-agent.module'
import { XpertAgentExecutionModule } from '../../../xpert-agent-execution/agent-execution.module'
import { AgentMiddlewareRuntimeModule } from './middleware-runtime.module'
import { AgentMiddlewareRuntimeService } from './middleware-runtime.service'

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
})

function getModuleMetadata(moduleType: Type<unknown>, key: string): unknown[] {
    const metadata: unknown = Reflect.getMetadata(key, moduleType)
    return Array.isArray(metadata) ? metadata : []
}
