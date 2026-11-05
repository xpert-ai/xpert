import { runIteration } from '../../workflow/run-iteration'
import { invokeChildGraph } from '../../../execution-control/attached-graph'
import { RunnableLambda } from '@langchain/core/runnables'
import {
    agentLabel,
    channelName,
    getVariableSchema,
    IEnvironment,
    IteratorIndexParameterName,
    IteratorItemParameterName,
    IWFNIterator,
    IWorkflowNode,
    IXpertAgentExecution,
    TAgentRunnableConfigurable,
    TWorkflowNodeMeta,
    TWorkflowVarGroup,
    TXpertGraph,
    TXpertParameter,
    TXpertTeamNode,
    WorkflowNodeTypeEnum,
    XpertParameterTypeEnum
} from '@xpert-ai/contracts'
import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { IWorkflowNodeStrategy, WorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { get } from 'lodash'
import { AgentStateAnnotation } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'
import { XpertWorkflowSubgraphCommand } from '../../commands/workflow-subgraph.command'

export const STATE_VARIABLE_ITERATOR_OUTPUT = 'output'
export const STATE_VARIABLE_ITERATOR_OUTPUT_STR = 'output_str'

export function iteratingOutputVariables(iterating: IWFNIterator) {
    return [
        {
            name: STATE_VARIABLE_ITERATOR_OUTPUT,
            type: iterating.outputParams?.length ? XpertParameterTypeEnum.ARRAY : XpertParameterTypeEnum.STRING,
            item:
                iterating.outputParams?.map((item) => ({
                    ...item,
                    type: item.type || XpertParameterTypeEnum.STRING
                })) ?? [],
            description: {
                en_US: 'Structured data sequence',
                zh_Hans: '结构化数据序列'
            }
        },
        {
            name: STATE_VARIABLE_ITERATOR_OUTPUT_STR,
            type: XpertParameterTypeEnum.ARRAY_STRING,
            description: {
                en_US: 'Serialized data sequence',
                zh_Hans: '序列化数据序列'
            }
        }
    ]
}

export function getIteratorSubgraphAgentMetadata(
    graph: TXpertGraph,
    startNodes: string[]
): { agentKey?: string; xpertName?: string } {
    if (startNodes.length !== 1) {
        return {}
    }

    const agentNode = graph.nodes.find(
        (node): node is TXpertTeamNode<'agent'> => node.type === 'agent' && node.key === startNodes[0]
    )
    if (!agentNode) {
        return {}
    }

    return {
        agentKey: agentNode.entity.key || agentNode.key,
        xpertName: agentLabel(agentNode.entity)
    }
}

@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.ITERATOR)
export class WorkflowIteratorNodeStrategy implements IWorkflowNodeStrategy {
    readonly #logger = new Logger(WorkflowIteratorNodeStrategy.name)

    @Inject(CommandBus)
    private readonly commandBus: CommandBus

    @Inject(QueryBus)
    private readonly queryBus: QueryBus

    readonly meta: TWorkflowNodeMeta = {
        name: WorkflowNodeTypeEnum.ITERATOR,
        label: {
            en_US: 'Iterator',
            zh_Hans: '迭代'
        },
        icon: null,
        configSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    }

    async create(payload: {
        graph: TXpertGraph
        node: TXpertTeamNode & { type: 'workflow' }
        xpertId: string
        environment: IEnvironment
        isDraft: boolean
    }) {
        const { xpertId, graph, node, isDraft, environment } = payload

        const entity = node.entity as IWFNIterator
        const iteratorChannel = channelName(node.key)

        const subgraphNodes = graph.nodes.filter(
            (n) => n.parentId === node.key && (n.type === 'agent' || n.type === 'workflow')
        )
        if (!subgraphNodes.length) {
            throw new InternalServerErrorException(this.translate('xpert.Error.NoChildNodeForLoop', entity))
        }
        const subgraphNodeKeys = new Set(subgraphNodes.map((n) => n.key))
        const subgraphConnections = graph.connections.filter((conn) => {
            const fromKey = conn.from.split('/')[0]
            if (conn.type === 'edge' || conn.type === 'workflow') {
                return subgraphNodeKeys.has(fromKey) && subgraphNodeKeys.has(conn.to)
            }
            // For agent/xpert connections (subflow → agent/xpert), only require the source is in the
            // subgraph. The target agent/xpert node may live outside the iterator container.
            if (conn.type === 'agent' || conn.type === 'xpert') {
                return subgraphNodeKeys.has(fromKey)
            }
            return false
        })

        // Include agent/xpert nodes referenced by subflow nodes inside the iterator.
        // They may not have parentId === iteratorKey but are required by CreateWNSubflowHandler
        // to look up which agent/xpert to execute.
        const referencedNodeKeys = new Set(
            subgraphConnections.filter((conn) => conn.type === 'agent' || conn.type === 'xpert').map((conn) => conn.to)
        )
        const referencedNodes = graph.nodes.filter((n) => referencedNodeKeys.has(n.key) && !subgraphNodeKeys.has(n.key))

        // Compute start nodes from the ORIGINAL iterator nodes only (i.e. nodes whose keys are in
        // subgraphNodeKeys), so that referenced external agent/xpert nodes added above are never
        // mistakenly treated as entry points by XpertWorkflowSubgraphHandler.
        const incomingKeys = new Set<string>()
        subgraphConnections
            .filter((conn) => conn.type === 'edge' || conn.type === 'workflow')
            .forEach((conn) => {
                if (subgraphNodeKeys.has(conn.to)) {
                    incomingKeys.add(conn.to)
                }
            })
        const startNodes = Array.from(subgraphNodeKeys).filter((key) => !incomingKeys.has(key))

        const subgraphGraph: TXpertGraph = {
            nodes: [...subgraphNodes, ...referencedNodes],
            connections: subgraphConnections
        }
        const subgraphAgentMetadata = getIteratorSubgraphAgentMetadata(subgraphGraph, startNodes)

        const inputVariable = entity.inputVariable
        const outputParams = entity.outputParams

        if (!outputParams?.length) {
            throw new InternalServerErrorException(this.translate('xpert.Error.OutputParamsRequired', entity))
        }

        return {
            graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
                const configurable: TAgentRunnableConfigurable = config.configurable
                const { subscriber, executionId } = configurable
                const execution: IXpertAgentExecution = {}
                let subgraph = null
                const abortController = new AbortController()
                const compiled = await this.commandBus.execute(
                    new XpertWorkflowSubgraphCommand({ id: xpertId }, graph, subgraphGraph, {
                        isDraft,
                        rootController: abortController,
                        signal: abortController.signal,
                        disableCheckpointer: true, // The loop node cannot record the execution log correctly, so the Checkpointer is temporarily disabled.
                        environment,
                        execution,
                        subscriber,
                        // Explicitly pass the start nodes derived from original iterator-contained nodes only,
                        // so that any external agent/xpert nodes included for subflow lookup are never
                        // mistakenly treated as entry points by XpertWorkflowSubgraphHandler.
                        startNodes,
                        variables: [
                            {
                                name: iteratorChannel,
                                type: XpertParameterTypeEnum.OBJECT
                            }
                        ]
                    } as any)
                )
                subgraph = compiled.graph

                const parameterValue = get(state, inputVariable)

                const invokeSubgraph = async (item, index: number, iterationSignal: AbortSignal) => {
                    // const originalState = isString(item)
                    // 	? { [IteratorIndexParameterName]: index, [IteratorItemParameterName]: item }
                    // 	: { ...(item ?? {}), [IteratorIndexParameterName]: index, [IteratorItemParameterName]: item }
                    const inputs = {
                        [iteratorChannel]: {
                            $index: index,
                            $item: item
                        }
                    }
                    // const _state = { ...state, ...originalState }
                    // inputs = inputParams.reduce((acc, curr) => {
                    // 	setStateVariable(acc, curr.variable, get(_state, curr.name))
                    // 	return acc
                    // }, inputs)

                    const itemExecution: IXpertAgentExecution = {
                        threadId: configurable.thread_id,
                        category: 'workflow',
                        type: WorkflowNodeTypeEnum.ITERATOR,
                        // xpert: { id: xpertId } as IXpert,
                        agentKey: node.key,
                        inputs: item,
                        title: entity.title,
                        parentId: executionId
                    }

                    return await wrapAgentExecution(
                        async () => {
                            const subAgentExecution: IXpertAgentExecution = {
                                threadId: configurable.thread_id,
                                inputs: inputs,
                                parentId: itemExecution.id
                            }
                            subAgentExecution.xpertId = xpertId

                            const retState = await wrapAgentExecution(
                                async () => {
                                    const retState = await invokeChildGraph(
                                        { ...config, signal: iterationSignal },
                                        {
                                            executionId: subAgentExecution.id,
                                            traceParentId: itemExecution.id,
                                            agentKey: subgraphAgentMetadata.agentKey ?? node.key,
                                            xpertName: subgraphAgentMetadata.xpertName
                                        },
                                        (childConfig) =>
                                            subgraph.invoke(
                                                {
                                                    ...state,
                                                    ...inputs
                                                },
                                                childConfig
                                            )
                                    )

                                    const outputItem = outputParams.reduce((acc, curr) => {
                                        if (curr.name === IteratorItemParameterName) {
                                            return get(retState, curr.variable)
                                        }
                                        acc[curr.name] = get(retState, curr.variable)
                                        return acc
                                    }, {})

                                    return {
                                        state: outputItem,
                                        output: outputItem
                                    }
                                },
                                {
                                    commandBus: this.commandBus,
                                    queryBus: this.queryBus,
                                    subscriber,
                                    execution: subAgentExecution
                                }
                            )()

                            return {
                                state: retState,
                                output: retState as any
                            }
                        },
                        {
                            commandBus: this.commandBus,
                            queryBus: this.queryBus,
                            subscriber,
                            execution: itemExecution
                        }
                    )()
                }

                const outputs = Array.isArray(parameterValue)
                    ? await runIteration(parameterValue, entity, config.signal, invokeSubgraph, (error) =>
                          this.#logger.error(error)
                      )
                    : entity.errorMode === 'remove'
                      ? []
                      : null

                return {
                    [channelName(node.key)]: {
                        [STATE_VARIABLE_ITERATOR_OUTPUT]: outputs,
                        [STATE_VARIABLE_ITERATOR_OUTPUT_STR]: outputs
                            ?.map((_) => (typeof _ === 'string' ? _ : JSON.stringify(_, null, 2)))
                            .join('\n')
                    }
                }
            }),
            ends: []
        }
    }

    inputVariables(entity: IWorkflowNode, variables?: TWorkflowVarGroup[]): TXpertParameter[] {
        const node = entity as IWFNIterator
        const itemSchema = resolveItemSchema(node.inputVariable, variables)

        return [
            {
                name: IteratorIndexParameterName,
                type: XpertParameterTypeEnum.NUMBER,
                description: {
                    en_US: 'Current index',
                    zh_Hans: '当前索引'
                }
            },
            {
                name: IteratorItemParameterName,
                type: itemSchema.type,
                item: itemSchema.item,
                description: {
                    en_US: 'Current item',
                    zh_Hans: '当前项'
                }
            }
        ]
    }

    outputVariables(entity: IWorkflowNode): TXpertParameter[] {
        return iteratingOutputVariables(entity as IWFNIterator)
    }

    translate(key: string, options): string {
        return t(key, { ns: 'server-ai', ...options }) as string
    }
}

function resolveItemSchema(inputVariable: string, variables?: TWorkflowVarGroup[]): Partial<TXpertParameter> {
    if (!inputVariable || !variables?.length) {
        return { type: XpertParameterTypeEnum.STRING }
    }

    const schema = getVariableSchema(variables, inputVariable).variable
    if (!schema?.type) {
        return { type: XpertParameterTypeEnum.STRING }
    }

    const typeValue = String(schema.type)
    const match = typeValue.match(/^array\[(.+)\]$/)
    if (match) {
        const rawType = match[1]
        if (rawType === XpertParameterTypeEnum.OBJECT && schema.item?.length) {
            return { type: XpertParameterTypeEnum.OBJECT, item: schema.item }
        }
        return { type: rawType as XpertParameterTypeEnum }
    }

    if (schema.type === XpertParameterTypeEnum.ARRAY) {
        return { type: XpertParameterTypeEnum.OBJECT, item: schema.item }
    }

    return { type: XpertParameterTypeEnum.STRING }
}
