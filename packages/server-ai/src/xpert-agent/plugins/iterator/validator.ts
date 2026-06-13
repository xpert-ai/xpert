import { ChecklistItem, IWFNIterator, TXpertTeamNode, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'

@Injectable()
export class WorkflowIteratorNodeValidator {
    @OnEvent(EventNameXpertValidate)
    handle(event: XpertDraftValidateEvent) {
        const draft = event.draft
        const iteratorNodes = draft.nodes.filter(
            (node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.ITERATOR
        )
        const items: ChecklistItem[] = []
        iteratorNodes.forEach((node) => {
            items.push(...this.check(node))
        })
        return items
    }

    check(node: TXpertTeamNode) {
        const entity = node.entity as IWFNIterator
        const items: ChecklistItem[] = []

        if (!entity.inputVariable) {
            items.push({
                node: node.key,
                ruleCode: 'ITERATOR_INPUT_VARIABLE_EMPTY',
                field: 'inputVariable',
                value: entity.inputVariable,
                message: {
                    en_US: 'Iterator node must have an input variable.',
                    zh_Hans: '迭代节点必须设置输入变量。'
                },
                level: 'error'
            })
        }

        if (!entity.outputParams?.length) {
            items.push({
                node: node.key,
                ruleCode: 'ITERATOR_OUTPUT_PARAMS_EMPTY',
                field: 'outputParams',
                value: JSON.stringify(entity.outputParams),
                message: {
                    en_US: 'Iterator node must have at least one output variable.',
                    zh_Hans: '迭代节点必须至少设置一个输出变量。'
                },
                level: 'error'
            })
            return items
        }

        entity.outputParams.forEach((param, index) => {
            if (!param.name) {
                items.push({
                    node: node.key,
                    ruleCode: 'ITERATOR_OUTPUT_PARAM_NAME_EMPTY',
                    field: `outputParams[${index}].name`,
                    value: param.name,
                    message: {
                        en_US: 'Iterator output variable name is empty.',
                        zh_Hans: '迭代节点的输出变量名称为空。'
                    },
                    level: 'error'
                })
            }

            if (!param.variable) {
                items.push({
                    node: node.key,
                    ruleCode: 'ITERATOR_OUTPUT_PARAM_VARIABLE_EMPTY',
                    field: `outputParams[${index}].variable`,
                    value: param.variable,
                    message: {
                        en_US: 'Iterator output variable selector is empty.',
                        zh_Hans: '迭代节点的输出变量选择器为空。'
                    },
                    level: 'error'
                })
            }
        })

        return items
    }
}
