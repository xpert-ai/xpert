import { MODULE_METADATA } from '@nestjs/common/constants'
import { XpertAgentModule } from '../../xpert-agent/xpert-agent.module'
import { AgentMiddlewareRuntimeModule } from './middleware-runtime.module'
import { AgentMiddlewareRuntimeService } from './middleware-runtime.service'

const modulesThatConsumeRuntime = [XpertAgentModule]

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

function getModuleMetadata(moduleType: unknown, key: string) {
    return ((Reflect as any).getMetadata(key, moduleType) ?? []) as unknown[]
}
