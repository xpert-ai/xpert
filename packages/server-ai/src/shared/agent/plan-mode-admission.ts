import { BadRequestException } from '@nestjs/common'
import { type IWFNMiddleware, type IXpertAgent, type TXpertGraph, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { getRuntimeEnabledMiddlewareNodes } from './middleware'
import type { TXpertAgentRuntimeOptions } from './state'
import { REQUEST_USER_INPUT_MIDDLEWARE_NAME } from './user-input'

// Plan Mode admission requires the configured capability; graph compilation stays mode-independent.
export function assertPlanModeAvailable(graph: TXpertGraph, agent: IXpertAgent, options: TXpertAgentRuntimeOptions) {
    if (agent.options?.hidden || agent.options?.structuredOutputMethod) {
        throw new BadRequestException(t('server-ai:UserInput.UnsupportedAgent'))
    }
    const enabled = getRuntimeEnabledMiddlewareNodes(graph, agent, options).some(
        (node) =>
            node.type === 'workflow' &&
            node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE &&
            (node.entity as IWFNMiddleware).provider === REQUEST_USER_INPUT_MIDDLEWARE_NAME
    )
    if (!enabled)
        throw new BadRequestException(
            t('server-ai:UserInput.PlanModeRequiresCapability', {
                defaultValue: 'Enable Ask for user input for this Assistant before using Plan Mode.'
            })
        )
}
