import { RunnableConfig } from '@langchain/core/runnables'
import { AgentMiddleware } from '@xpert-ai/plugin-sdk'
import { IXpert } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { AgentStateAnnotation, ConversationTitleService } from '../../shared'

type CreateXpertTitleMiddlewareOptions = {
    agentChannel: string
    xpert: IXpert
}

const XPERT_TITLE_MIDDLEWARE_NAME = '__xpert_title_middleware__'

@Injectable()
export class XpertTitleMiddlewareService {
    constructor(private readonly conversationTitleService: ConversationTitleService) {}

    createMiddleware(options: CreateXpertTitleMiddlewareOptions): AgentMiddleware {
        const { agentChannel, xpert } = options

        return {
            name: XPERT_TITLE_MIDDLEWARE_NAME,
            afterAgent: async (state, runtime) => {
                if ((state as typeof AgentStateAnnotation.State).title) {
                    return
                }

                return this.conversationTitleService.generateStatePatch({
                    channel: agentChannel,
                    config: runtime as RunnableConfig,
                    state: state as typeof AgentStateAnnotation.State,
                    xpert
                })
            }
        }
    }
}
