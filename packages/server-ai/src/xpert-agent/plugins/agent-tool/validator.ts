import {
    ChecklistItem,
    channelName,
    getVariableSchema,
    IWFNAgentWorkflow,
    IWFNIterating,
    IWFNIterator,
    IWFNKnowledgeRetrieval,
    IWFNSubflow,
    IWorkflowNode,
    isAgentWorkflowNodeType,
    TWorkflowVarGroup,
    TXpertGraph,
    TXpertParameter,
    TXpertTeamConnection,
    TXpertTeamDraft,
    TXpertTeamNode,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { Inject, Injectable, Optional } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { WorkflowNodeRegistry } from '@xpert-ai/plugin-sdk'
import { answerOutputVariables } from '../../workflow/answer/node'
import { classifierOutputVariables } from '../../workflow/classifier'
import { codeOutputVariables } from '../../workflow/code/node'
import { httpOutoutVariables } from '../../workflow/http'
import { knowledgeOutputVariables } from '../../workflow/knowledge'
import { subflowOutputVariables } from '../../workflow/subflow'
import { templateOutputVariables } from '../../workflow/template'
import { toolOutputVariables } from '../../workflow/tool'
import { iteratingOutputVariables as legacyIteratingOutputVariables } from '../../workflow/iterating'
import { iteratingOutputVariables as iteratorOutputVariables } from '../iterator/strategy'
import { EventNameXpertValidate, XpertDraftValidateEvent } from '../../../xpert/types'

type TWorkflowOutputVariableStrategy = {
    outputVariables(entity: IWorkflowNode): TXpertParameter[]
}

type TWorkflowOutputVariableRegistry = {
    get(type: string): TWorkflowOutputVariableStrategy
}

@Injectable()
export class WorkflowAgentWorkflowValidator {
    constructor(
        @Optional()
        @Inject(WorkflowNodeRegistry)
        private readonly nodeRegistry?: TWorkflowOutputVariableRegistry
    ) {}

    @OnEvent(EventNameXpertValidate)
    handle(event: XpertDraftValidateEvent) {
        const draft = event.draft
        const agentToolNodes = draft.nodes.filter(
            (node) => node.type === 'workflow' && isAgentWorkflowNodeType(node.entity.type)
        )
        const items: ChecklistItem[] = []
        agentToolNodes.forEach((node) => {
            items.push(...this.check(node, draft))
        })
        return items
    }

    check(node: TXpertTeamNode, draft?: TXpertTeamDraft) {
        const entity = node.entity as IWFNAgentWorkflow
        const items: ChecklistItem[] = []
        if (!entity.toolName) {
            items.push({
                node: node.key,
                ruleCode: 'AGENT_TOOL_NAME_EMPTY',
                field: 'toolName',
                value: entity.toolName,
                message: {
                    en_US: `Tool name is empty, the node key is used as the tool name.`,
                    zh_Hans: `工具名称是空的，则使用节点键作为工具名称`
                },
                level: 'warning'
            })
        }

        if (entity.returnSource?.type === 'variable' && !entity.returnSource.variableSelector) {
            items.push({
                node: node.key,
                ruleCode: 'AGENT_TOOL_RETURN_VARIABLE_EMPTY',
                field: 'returnSource.variableSelector',
                value: entity.returnSource.variableSelector,
                message: {
                    en_US: 'Agent workflow return variable is empty.',
                    zh_Hans: '智能体工作流的返回变量为空。'
                },
                level: 'error'
            })
        } else if (entity.returnSource?.type === 'variable' && draft) {
            const variableCheck = checkReturnVariable(
                draft,
                node.key,
                entity.returnSource.variableSelector,
                this.nodeRegistry
            )
            if (variableCheck.type === 'not_found') {
                items.push({
                    node: node.key,
                    ruleCode: 'AGENT_TOOL_RETURN_VARIABLE_NOT_FOUND',
                    field: 'returnSource.variableSelector',
                    value: entity.returnSource.variableSelector,
                    message: {
                        en_US: 'Agent workflow return variable is not produced by any reachable downstream workflow node.',
                        zh_Hans: '智能体工作流的返回变量不是由任何可达的后续工作流节点产生的。'
                    },
                    level: 'error'
                })
            } else if (variableCheck.type === 'not_on_all_paths') {
                items.push({
                    node: node.key,
                    ruleCode: 'AGENT_TOOL_RETURN_VARIABLE_NOT_ON_ALL_PATHS',
                    field: 'returnSource.variableSelector',
                    value: entity.returnSource.variableSelector,
                    message: {
                        en_US: 'Agent workflow return variable is produced on only some downstream paths. Move the producer after the branches merge or use a template/Answer node for every branch.',
                        zh_Hans:
                            '智能体工作流的返回变量只在部分后续路径上产生。请将产出节点移动到分支汇合之后，或为每个分支使用模板/回答节点生成返回内容。'
                    },
                    level: 'error'
                })
            }
        }

        if (entity.returnSource?.type === 'template' && !entity.returnSource.template) {
            items.push({
                node: node.key,
                ruleCode: 'AGENT_TOOL_RETURN_TEMPLATE_EMPTY',
                field: 'returnSource.template',
                value: entity.returnSource.template,
                message: {
                    en_US: 'Agent workflow return template is empty.',
                    zh_Hans: '智能体工作流的返回模板为空。'
                },
                level: 'error'
            })
        }

        const usesLastMessage = !entity.returnSource || entity.returnSource.type === 'last_message'
        if (usesLastMessage && draft && hasIteratorTerminal(draft, node.key)) {
            items.push({
                node: node.key,
                ruleCode: 'AGENT_TOOL_LAST_MESSAGE_WITH_ITERATOR_TERMINAL',
                field: 'returnSource',
                value: entity.returnSource ? JSON.stringify(entity.returnSource) : '',
                message: {
                    en_US: 'Agent workflow ends on an iterator path but returns the last message. Select the iterator output_str variable or add an Answer node after the iterator.',
                    zh_Hans:
                        '智能体工作流的后续路径以迭代节点结束，但返回内容仍使用最后一条消息。请选择迭代节点的 output_str 变量，或在迭代节点后添加回答节点。'
                },
                level: 'error'
            })
        }

        return items
    }
}

export class WorkflowAgentToolValidator extends WorkflowAgentWorkflowValidator {}

function isRuntimeNode(node: TXpertTeamNode): node is TXpertTeamNode<'agent' | 'workflow'> {
    return node.type === 'agent' || node.type === 'workflow'
}

function isWorkflowNodeSource(from: string, nodeKey: string) {
    return from === nodeKey || from.startsWith(`${nodeKey}/`)
}

function isInternalContainerEdge(connection: TXpertTeamConnection, childNodeKeys: Set<string>) {
    return childNodeKeys.has(connection.to)
}

function getExternalNextNodes(graph: TXpertGraph, nodeKey: string) {
    const childNodeKeys = new Set(
        graph.nodes.filter((item) => item.parentId === nodeKey && isRuntimeNode(item)).map((item) => item.key)
    )

    return graph.connections
        .filter((connection) => connection.type === 'edge')
        .filter((connection) => isWorkflowNodeSource(connection.from, nodeKey))
        .filter((connection) => !isInternalContainerEdge(connection, childNodeKeys))
        .map((connection) => graph.nodes.find((item) => isRuntimeNode(item) && item.key === connection.to))
        .filter((item): item is TXpertTeamNode<'agent' | 'workflow'> => !!item)
}

function collectTerminalNodes(graph: TXpertGraph, startKey: string) {
    return collectTerminalPaths(graph, startKey)
        .map((path) => path[path.length - 1])
        .filter((node): node is TXpertTeamNode<'agent' | 'workflow'> => !!node)
}

function collectTerminalPaths(graph: TXpertGraph, startKey: string) {
    const terminalPaths: TXpertTeamNode<'agent' | 'workflow'>[][] = []
    const stack = getExternalNextNodes(graph, startKey).map((node) => ({
        node,
        path: [node]
    }))

    while (stack.length) {
        const current = stack.pop()
        const node = current?.node
        if (!node) {
            continue
        }

        const nextNodes = getExternalNextNodes(graph, node.key).filter(
            (nextNode) => !current.path.some((pathNode) => pathNode.key === nextNode.key)
        )
        if (nextNodes.length === 0) {
            terminalPaths.push(current.path)
        } else {
            stack.push(
                ...nextNodes.map((nextNode) => ({
                    node: nextNode,
                    path: [...current.path, nextNode]
                }))
            )
        }
    }

    return terminalPaths
}

function hasIteratorTerminal(graph: TXpertGraph, startKey: string) {
    return collectTerminalNodes(graph, startKey).some(
        (node) =>
            node.type === 'workflow' &&
            (node.entity.type === WorkflowNodeTypeEnum.ITERATOR || node.entity.type === WorkflowNodeTypeEnum.ITERATING)
    )
}

function checkReturnVariable(
    graph: TXpertGraph,
    startKey: string,
    variableSelector: string,
    nodeRegistry?: TWorkflowOutputVariableRegistry
) {
    const terminalPaths = collectTerminalPaths(graph, startKey)
    const variableGroups = buildReachableOutputVariableGroups(graph, terminalPaths, nodeRegistry)
    const variableSchema = getVariableSchema(variableGroups, variableSelector)
    if (!variableSchema.variable) {
        return {
            type: 'not_found' as const
        }
    }

    const producerKey = findProducerKeyBySelector(graph, variableSelector)
    if (!producerKey) {
        return {
            type: 'ok' as const
        }
    }

    if (terminalPaths.some((path) => !path.some((node) => node.key === producerKey))) {
        return {
            type: 'not_on_all_paths' as const
        }
    }

    return {
        type: 'ok' as const
    }
}

function buildReachableOutputVariableGroups(
    graph: TXpertGraph,
    terminalPaths: TXpertTeamNode<'agent' | 'workflow'>[][],
    nodeRegistry?: TWorkflowOutputVariableRegistry
): TWorkflowVarGroup[] {
    const reachableNodes = new Map<string, TXpertTeamNode<'agent' | 'workflow'>>()
    terminalPaths.flat().forEach((node) => reachableNodes.set(node.key, node))

    const groups: TWorkflowVarGroup[] = []
    for (const node of reachableNodes.values()) {
        if (node.type !== 'workflow') {
            continue
        }
        const variables = getOutputVariables(node.entity, nodeRegistry)
        if (!variables.length) {
            continue
        }
        groups.push({
            group: {
                name: channelName(node.key),
                description: node.entity.title || {
                    en_US: node.key
                }
            },
            variables
        })
    }

    return groups
}

function getOutputVariables(entity: IWorkflowNode, nodeRegistry?: TWorkflowOutputVariableRegistry): TXpertParameter[] {
    switch (entity.type) {
        case WorkflowNodeTypeEnum.KNOWLEDGE:
            return knowledgeOutputVariables(entity as IWFNKnowledgeRetrieval)
        case WorkflowNodeTypeEnum.SUBFLOW:
            return subflowOutputVariables(entity as IWFNSubflow)
        case WorkflowNodeTypeEnum.TEMPLATE:
            return templateOutputVariables(entity)
        case WorkflowNodeTypeEnum.CLASSIFIER:
            return classifierOutputVariables(entity)
        case WorkflowNodeTypeEnum.TOOL:
            return toolOutputVariables(entity)
        case WorkflowNodeTypeEnum.ANSWER:
            return answerOutputVariables(entity)
        case WorkflowNodeTypeEnum.CODE:
            return codeOutputVariables(entity)
        case WorkflowNodeTypeEnum.HTTP:
            return httpOutoutVariables()
        case WorkflowNodeTypeEnum.ITERATING:
            return legacyIteratingOutputVariables(entity as IWFNIterating)
        case WorkflowNodeTypeEnum.ITERATOR:
            return iteratorOutputVariables(entity as IWFNIterator)
        default:
            try {
                return nodeRegistry?.get(entity.type).outputVariables(entity) ?? []
            } catch {
                return []
            }
    }
}

function findProducerKeyBySelector(graph: TXpertGraph, variableSelector: string) {
    const [groupName] = variableSelector.split('.')
    if (!groupName) {
        return null
    }
    return graph.nodes.find((node) => isRuntimeNode(node) && channelName(node.key) === groupName)?.key ?? null
}
