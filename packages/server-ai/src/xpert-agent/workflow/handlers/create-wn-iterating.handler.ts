import { runIteration } from '../run-iteration'
import { invokeChildGraph } from '../../../execution-control/attached-graph'
import { RunnableLambda } from '@langchain/core/runnables'
import { CompiledStateGraph } from '@langchain/langgraph'
import {
    agentLabel,
    channelName,
    IteratingIndexParameterName,
    IteratingItemParameterName,
    IWFNIterating,
    IXpert,
    IXpertAgent,
    IXpertAgentExecution,
    mapTranslationLanguage,
    setStateVariable,
    TAgentRunnableConfigurable,
    TXpertTeamNode,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { InternalServerErrorException, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { get, isString } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { XpertAgentSubgraphCommand } from '../../commands/subgraph.command'
import { CreateWNIteratingCommand } from '../create-wn-iterating.command'
import { STATE_VARIABLE_ITERATING_OUTPUT, STATE_VARIABLE_ITERATING_OUTPUT_STR } from '../iterating'
import { CompileGraphCommand } from '../../commands'
import { AgentStateAnnotation } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'

/**
 * @deprecated use Iterator Plugin instead
 */
@CommandHandler(CreateWNIteratingCommand)
export class CreateWNIteratingHandler implements ICommandHandler<CreateWNIteratingCommand> {
    readonly #logger = new Logger(CreateWNIteratingHandler.name)

    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly i18nService: I18nService
    ) {}

    public async execute(command: CreateWNIteratingCommand) {
        const { xpertId, graph, node, options } = command
        const { subscriber, isDraft, environment } = options

        const entity = node.entity as IWFNIterating

        // Get the only child agent node
        const connections = graph.connections.filter(
            (conn) => (conn.type === 'agent' || conn.type === 'xpert') && conn.from === node.key
        )
        if (connections.length > 1) {
            throw new InternalServerErrorException(await this.translate('xpert.Error.MultiNodeNotSupported', entity))
        }
        if (connections.length < 1) {
            throw new InternalServerErrorException(await this.translate('xpert.Error.NoChildNodeForLoop', entity))
        }

        let extXpert: IXpert = null
        let _xpertId = xpertId
        let agentKey: string = null
        if (connections[0].type === 'xpert') {
            // Collaborator (external xpert)
            const collaboratorNode = graph.nodes.find(
                (n) => n.type === 'xpert' && n.key === connections[0].to
            ) as TXpertTeamNode & { type: 'xpert' }
            if (collaboratorNode) {
                extXpert = collaboratorNode.entity
                _xpertId = collaboratorNode.key
                agentKey = collaboratorNode.entity.agent.key
            }
        } else {
            const agentNode = graph.nodes.find(
                (n) => n.type === 'agent' && n.key === connections[0].to
            ) as TXpertTeamNode & { type: 'agent' }
            if (agentNode) {
                agentKey = agentNode.key
            }
        }

        const inputVariable = entity.inputVariable
        const inputParams = entity.inputParams
        const outputParams = entity.outputParams

        if (!inputParams?.length) {
            throw new InternalServerErrorException(await this.translate('xpert.Error.InputParamsRequired', entity))
        }

        if (!outputParams?.length) {
            throw new InternalServerErrorException(await this.translate('xpert.Error.OutputParamsRequired', entity))
        }

        let subgraph = null
        let subAgent: IXpertAgent = null
        const execution: IXpertAgentExecution = {}
        const abortController = new AbortController()
        // Create graph by command
        if (extXpert) {
            const compiled = await this.commandBus.execute<
                CompileGraphCommand,
                { graph: CompiledStateGraph<unknown, unknown>; agent: IXpertAgent }
            >(
                new CompileGraphCommand(
                    agentKey,
                    { id: _xpertId },
                    {
                        isDraft,
                        mute: command.options.mute,
                        store: command.options.store,
                        execution,
                        rootController: abortController,
                        signal: abortController.signal,
                        subscriber,
                        workspaceRoot: command.options.workspaceRoot,
                        workspacePath: command.options.workspacePath,
                        environment
                    }
                )
            )
            subgraph = compiled.graph
            subAgent = compiled.agent
        } else {
            const compiled = await this.commandBus.execute<
                XpertAgentSubgraphCommand,
                { agent: IXpertAgent; graph: CompiledStateGraph<any, any, any> }
            >(
                new XpertAgentSubgraphCommand(
                    agentKey,
                    { id: _xpertId },
                    {
                        executionDefinition: command.options.executionDefinition,
                        planMode: command.options.planMode,
                        isDraft,
                        mute: command.options.mute,
                        store: command.options.store,
                        isStart: true,
                        rootController: abortController,
                        signal: abortController.signal,
                        execution,
                        subscriber,
                        workspaceRoot: command.options.workspaceRoot,
                        workspacePath: command.options.workspacePath,
                        disableCheckpointer: true, // The loop node cannot record the execution log correctly, so the Checkpointer is temporarily disabled.
                        channel: channelName(agentKey),
                        partners: [],
                        environment
                    }
                )
            )
            subgraph = compiled.graph
            subAgent = compiled.agent
        }
        const xpertName = subAgent ? agentLabel(subAgent) : agentKey

        return {
            workflowNode: {
                graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
                    const configurable: TAgentRunnableConfigurable = config.configurable
                    const { subscriber, executionId } = configurable
                    const parameterValue = get(state, inputVariable)

                    const invokeSubgraph = async (item, index: number, iterationSignal: AbortSignal) => {
                        const originalState = isString(item)
                            ? { [IteratingIndexParameterName]: index, [IteratingItemParameterName]: item }
                            : {
                                  ...(item ?? {}),
                                  [IteratingIndexParameterName]: index,
                                  [IteratingItemParameterName]: item
                              }
                        let inputs = {}
                        const _state = { ...state, ...originalState }
                        inputs = inputParams.reduce((acc, curr) => {
                            setStateVariable(acc, curr.variable, get(_state, curr.name))
                            return acc
                        }, inputs)

                        const itemExecution: IXpertAgentExecution = {
                            threadId: configurable.thread_id,
                            category: 'workflow',
                            type: WorkflowNodeTypeEnum.ITERATING,
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
                                if (extXpert) {
                                    subAgentExecution.xpertId = extXpert.id
                                } else {
                                    subAgentExecution.xpertId = xpertId
                                    subAgentExecution.agentKey = agentKey
                                }

                                const retState = await wrapAgentExecution(
                                    async () => {
                                        const retState = await invokeChildGraph(
                                            { ...config, signal: iterationSignal },
                                            {
                                                executionId: subAgentExecution.id,
                                                traceParentId: itemExecution.id,
                                                agentKey,
                                                xpertName
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
                                            if (curr.name === IteratingItemParameterName) {
                                                return get(retState, curr.variable)
                                            }
                                            acc[curr.name] = get(retState, curr.variable)
                                            return acc
                                        }, {})
                                        const output = retState[channelName(agentKey)]?.output

                                        return {
                                            state: outputItem,
                                            output: output
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
                                    output: retState as string
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
                            [STATE_VARIABLE_ITERATING_OUTPUT]: outputs,
                            [STATE_VARIABLE_ITERATING_OUTPUT_STR]: outputs
                                ?.map((_) => (typeof _ === 'string' ? _ : JSON.stringify(_, null, 2)))
                                .join('\n')
                        }
                    }
                }),
                ends: []
            }
            // navigator: async (state: typeof AgentStateAnnotation.State, config) => {
            // 	return nextWorkflowNodes(graph, node.key, state)
            // }
        }
    }

    async translate(key: string, entity: IWFNIterating) {
        return await this.i18nService.translate(key, {
            lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
            args: {
                node: entity.title || entity.key
            }
        })
    }
}
