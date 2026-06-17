import { ChecklistItem, TXpertTeamNode } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../xpert/types'

@Injectable()
export class XpertAgentNodeValidator {
    @OnEvent(EventNameXpertValidate)
    handle(event: XpertDraftValidateEvent) {
        const items: ChecklistItem[] = []
        event.draft.nodes
            .filter((node): node is TXpertTeamNode<'agent'> => node.type === 'agent')
            .forEach((node) => {
                items.push(...this.check(node))
            })
        return items
    }

    check(node: TXpertTeamNode<'agent'>) {
        const agent = node.entity
        const items: ChecklistItem[] = []
        if (agent.options?.structuredOutputMethod && agent.options.fileUnderstanding?.enabled !== false) {
            items.push({
                node: node.key,
                ruleCode: 'AGENT_STRUCTURED_OUTPUT_FILE_UNDERSTANDING_CONFLICT',
                field: 'options.fileUnderstanding.enabled',
                value: String(agent.options.fileUnderstanding?.enabled ?? true),
                message: {
                    en_US: 'File understanding cannot be used together with structured output. The built-in file understanding tools will be skipped while structured output is enabled.',
                    zh_Hans: '文件理解不能与结构化输出同时使用。启用结构化输出时，内置文件理解工具会被跳过。'
                },
                level: 'warning'
            })
        }
        return items
    }
}
