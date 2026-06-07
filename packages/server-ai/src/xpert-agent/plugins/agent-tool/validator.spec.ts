import {
    IWFNAgentWorkflow,
    IWFNAnswer,
    IWFNIterator,
    IWFNTemplate,
    TXpertTeamConnection,
    TXpertTeamDraft,
    TXpertTeamNode,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { WorkflowAgentWorkflowValidator } from './validator'

describe('WorkflowAgentWorkflowValidator', () => {
    let validator: WorkflowAgentWorkflowValidator

    const createAgentToolNode = (overrides: Partial<IWFNAgentWorkflow> = {}): TXpertTeamNode<'workflow'> => {
        const entity: IWFNAgentWorkflow = {
            id: 'node-1',
            key: 'AgentTool_1',
            type: WorkflowNodeTypeEnum.AGENT_WORKFLOW,
            title: 'Agent Workflow',
            toolName: 'submit_report',
            ...overrides
        }

        return {
            type: 'workflow',
            key: 'AgentTool_1',
            position: { x: 0, y: 0 },
            entity
        }
    }

    const createIteratorNode = (key = 'Iterator_1'): TXpertTeamNode<'workflow'> => {
        const entity: IWFNIterator = {
            id: key,
            key,
            type: WorkflowNodeTypeEnum.ITERATOR,
            title: 'Iterator',
            inputVariable: 'items'
        }

        return {
            type: 'workflow',
            key,
            position: { x: 200, y: 0 },
            entity
        }
    }

    const createAnswerNode = (key = 'Answer_1'): TXpertTeamNode<'workflow'> => {
        const entity: IWFNAnswer = {
            id: key,
            key,
            type: WorkflowNodeTypeEnum.ANSWER,
            title: 'Answer',
            promptTemplate: 'Done'
        }

        return {
            type: 'workflow',
            key,
            position: { x: 400, y: 0 },
            entity
        }
    }

    const createTemplateNode = (key = 'Template_1'): TXpertTeamNode<'workflow'> => {
        const entity: IWFNTemplate = {
            id: key,
            key,
            type: WorkflowNodeTypeEnum.TEMPLATE,
            title: 'Template',
            code: 'Merged'
        }

        return {
            type: 'workflow',
            key,
            position: { x: 600, y: 0 },
            entity
        }
    }

    const createEdge = (from: string, to: string): TXpertTeamConnection => ({
        type: 'edge',
        key: `${from}/${to}`,
        from,
        to
    })

    const createDraft = (
        agentToolOverrides: Partial<IWFNAgentWorkflow> = {},
        nodes: TXpertTeamNode[] = [],
        connections: TXpertTeamConnection[] = []
    ): TXpertTeamDraft => {
        const agentToolNode = createAgentToolNode(agentToolOverrides)
        return {
            team: {
                id: 'xpert-1'
            },
            nodes: [agentToolNode, ...nodes],
            connections
        }
    }

    beforeEach(() => {
        validator = new WorkflowAgentWorkflowValidator()
    })

    it('returns a warning when toolName is empty', () => {
        const results = validator.handle({
            draft: createDraft({
                toolName: ''
            })
        })

        expect(results).toEqual([
            {
                node: 'AgentTool_1',
                ruleCode: 'AGENT_TOOL_NAME_EMPTY',
                field: 'toolName',
                value: '',
                message: {
                    en_US: 'Tool name is empty, the node key is used as the tool name.',
                    zh_Hans: '工具名称是空的，则使用节点键作为工具名称'
                },
                level: 'warning'
            }
        ])
    })

    it('passes when toolName is configured', () => {
        const results = validator.handle({
            draft: createDraft()
        })

        expect(results).toEqual([])
    })

    it('keeps validating legacy agent-tool nodes for compatibility', () => {
        const results = validator.handle({
            draft: createDraft({
                type: WorkflowNodeTypeEnum.AGENT_TOOL
            })
        })

        expect(results).toEqual([])
    })

    it('returns an error when return variable is empty', () => {
        const results = validator.handle({
            draft: createDraft({
                returnSource: {
                    type: 'variable',
                    variableSelector: ''
                }
            })
        })

        expect(results).toEqual([
            {
                node: 'AgentTool_1',
                ruleCode: 'AGENT_TOOL_RETURN_VARIABLE_EMPTY',
                field: 'returnSource.variableSelector',
                value: '',
                message: {
                    en_US: 'Agent workflow return variable is empty.',
                    zh_Hans: '智能体工作流的返回变量为空。'
                },
                level: 'error'
            }
        ])
    })

    it('returns an error when return template is empty', () => {
        const results = validator.handle({
            draft: createDraft({
                returnSource: {
                    type: 'template',
                    template: ''
                }
            })
        })

        expect(results).toEqual([
            {
                node: 'AgentTool_1',
                ruleCode: 'AGENT_TOOL_RETURN_TEMPLATE_EMPTY',
                field: 'returnSource.template',
                value: '',
                message: {
                    en_US: 'Agent workflow return template is empty.',
                    zh_Hans: '智能体工作流的返回模板为空。'
                },
                level: 'error'
            }
        ])
    })

    it('returns an error when last-message return ends on an iterator node', () => {
        const iterator = createIteratorNode()
        const results = validator.handle({
            draft: createDraft({}, [iterator], [createEdge('AgentTool_1', iterator.key)])
        })

        expect(results).toEqual([
            {
                node: 'AgentTool_1',
                ruleCode: 'AGENT_TOOL_LAST_MESSAGE_WITH_ITERATOR_TERMINAL',
                field: 'returnSource',
                value: '',
                message: {
                    en_US: 'Agent workflow ends on an iterator path but returns the last message. Select the iterator output_str variable or add an Answer node after the iterator.',
                    zh_Hans:
                        '智能体工作流的后续路径以迭代节点结束，但返回内容仍使用最后一条消息。请选择迭代节点的 output_str 变量，或在迭代节点后添加回答节点。'
                },
                level: 'error'
            }
        ])
    })

    it('passes when an iterator terminal has an explicit return variable', () => {
        const iterator = createIteratorNode()
        const results = validator.handle({
            draft: createDraft(
                {
                    returnSource: {
                        type: 'variable',
                        variableSelector: 'iterator_1_channel.output_str'
                    }
                },
                [iterator],
                [createEdge('AgentTool_1', iterator.key)]
            )
        })

        expect(results).toEqual([])
    })

    it('returns an error when the explicit return variable is not reachable', () => {
        const iterator = createIteratorNode()
        const results = validator.handle({
            draft: createDraft(
                {
                    returnSource: {
                        type: 'variable',
                        variableSelector: 'iterator_1_channel.missing'
                    }
                },
                [iterator],
                [createEdge('AgentTool_1', iterator.key)]
            )
        })

        expect(results).toEqual([
            {
                node: 'AgentTool_1',
                ruleCode: 'AGENT_TOOL_RETURN_VARIABLE_NOT_FOUND',
                field: 'returnSource.variableSelector',
                value: 'iterator_1_channel.missing',
                message: {
                    en_US: 'Agent workflow return variable is not produced by any reachable downstream workflow node.',
                    zh_Hans: '智能体工作流的返回变量不是由任何可达的后续工作流节点产生的。'
                },
                level: 'error'
            }
        ])
    })

    it('returns an error when the explicit return variable is only produced on some paths', () => {
        const iterator = createIteratorNode()
        const answer = createAnswerNode()
        const results = validator.handle({
            draft: createDraft(
                {
                    returnSource: {
                        type: 'variable',
                        variableSelector: 'iterator_1_channel.output_str'
                    }
                },
                [iterator, answer],
                [createEdge('AgentTool_1', iterator.key), createEdge('AgentTool_1', answer.key)]
            )
        })

        expect(results).toEqual([
            {
                node: 'AgentTool_1',
                ruleCode: 'AGENT_TOOL_RETURN_VARIABLE_NOT_ON_ALL_PATHS',
                field: 'returnSource.variableSelector',
                value: 'iterator_1_channel.output_str',
                message: {
                    en_US: 'Agent workflow return variable is produced on only some downstream paths. Move the producer after the branches merge or use a template/Answer node for every branch.',
                    zh_Hans:
                        '智能体工作流的返回变量只在部分后续路径上产生。请将产出节点移动到分支汇合之后，或为每个分支使用模板/回答节点生成返回内容。'
                },
                level: 'error'
            }
        ])
    })

    it('passes when the explicit return variable is produced after branch paths merge', () => {
        const answerA = createAnswerNode('Answer_A')
        const answerB = createAnswerNode('Answer_B')
        const template = createTemplateNode('Template_Merge')
        const results = validator.handle({
            draft: createDraft(
                {
                    returnSource: {
                        type: 'variable',
                        variableSelector: 'template_merge_channel.output'
                    }
                },
                [answerA, answerB, template],
                [
                    createEdge('AgentTool_1', answerA.key),
                    createEdge('AgentTool_1', answerB.key),
                    createEdge(answerA.key, template.key),
                    createEdge(answerB.key, template.key)
                ]
            )
        })

        expect(results).toEqual([])
    })

    it('passes when the iterator path ends on an answer node', () => {
        const iterator = createIteratorNode()
        const answer = createAnswerNode()
        const results = validator.handle({
            draft: createDraft(
                {},
                [iterator, answer],
                [createEdge('AgentTool_1', iterator.key), createEdge(iterator.key, answer.key)]
            )
        })

        expect(results).toEqual([])
    })
})
