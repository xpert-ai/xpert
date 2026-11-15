import { ForbiddenException, Injectable } from '@nestjs/common'
import { XpertViewHostContext, XpertViewSlot } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import {
    ViewHostDefinition,
    ViewHostDefinitionContract,
    ViewHostResolution,
    ViewHostResolutionOptions
} from '@xpert-ai/server-core'
import { AgentViewHostDefinition } from './agent-view-host.definition'

@Injectable()
@ViewHostDefinition('assistant-studio')
export class StudioMemoryHostDefinition implements ViewHostDefinitionContract {
    readonly hostType = 'assistant-studio'
    readonly slots: XpertViewSlot[] = [{ key: 'assistant.studio.memory', mode: 'sections' }]
    constructor(private readonly agent: AgentViewHostDefinition) {}
    resolve(hostId: string, options?: ViewHostResolutionOptions) {
        if (
            RequestContext.currentApiPrincipal() ||
            options?.runtimeScope?.projectId ||
            options?.runtimeScope?.conversationId ||
            options?.runtimeScope?.groupId
        )
            throw new ForbiddenException()
        return this.agent.resolve(hostId, { isDraft: true })
    }
    canRead(context: XpertViewHostContext, resolution: ViewHostResolution) {
        return this.agent.canRead(context, resolution, { isDraft: true })
    }
}
