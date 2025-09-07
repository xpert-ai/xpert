import {
	channelName,
	getAgentVarGroup,
	getCurrentGraph,
	IWFNIterating,
	IWFNKnowledgeRetrieval,
	IWFNSubflow,
	IWorkflowNode,
	IXpert,
	STATE_VARIABLE_FILES,
	STATE_VARIABLE_HUMAN,
	STATE_VARIABLE_INPUT,
	STATE_VARIABLE_SYS,
	TStateVariable,
	TWorkflowVarGroup,
	TXpertGraph,
	TXpertParameter,
	WorkflowNodeTypeEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { omit } from '@metad/server-common'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { EnvironmentService } from '../../../environment'
import { BaseToolset, ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { XpertService } from '../../../xpert/xpert.service'
import {
	agentToolOutputVariables,
	answerOutputVariables,
	classifierOutputVariables,
	codeOutputVariables,
	httpOutoutVariables,
	iteratingOutputVariables,
	knowledgeOutputVariables,
	subflowOutputVariables,
	templateOutputVariables,
	toolOutputVariables,
	triggerOutputVariables
} from '../../workflow'
import { XpertAgentVariablesQuery } from '../get-variables.query'
import { getXpertAgent } from '../../../xpert/utils'

@QueryHandler(XpertAgentVariablesQuery)
export class XpertAgentVariablesHandler implements IQueryHandler<XpertAgentVariablesQuery> {
	constructor(
		private readonly xpertService: XpertService,
		private readonly environmentService: EnvironmentService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentVariablesQuery): Promise<TWorkflowVarGroup[]> {
		const { xpertId, type, nodeKey, isDraft, environmentId } = command.options

		// const xpert = await this.xpertService.findOne(xpertId, { select: ['id', 'agentConfig', 'draft', 'graph'] })

		const xpert = await this.xpertService.findOne(xpertId, {
			relations: [
				'agent',
				'agent.copilotModel',
				'copilotModel',
				'copilotModel.copilot',
				'agents',
				'agents.copilotModel',
				'knowledgebases',
				'toolsets',
				'executors'
			]
		})

		const varGroups: TWorkflowVarGroup[] = []
		const variables: TStateVariable[] = []
		varGroups.push({
			group: {
				name: '',
				description: {
					en_US: 'Global',
					zh_Hans: '全局变量'
				}
			},
			variables
		})

		// Environment variables
		if (environmentId && type !== 'input') {
			const environment = await this.environmentService.findOne(environmentId)
			varGroups.push({
				group: {
					name: 'env',
					description: {
						en_US: 'Environment',
						zh_Hans: '环境变量'
					}
				},
				variables: environment.variables
					?.filter((_) => _.name)
					.map((_) => ({
						name: _.name,
						type: _.type === 'secret' ? XpertParameterTypeEnum.SECRET : XpertParameterTypeEnum.STRING,
						description: {
							en_US: ''
						}
					}))
			})
		}

		// User parameters
		varGroups.push({
			group: {
				name: STATE_VARIABLE_HUMAN,
				description: {
					en_US: 'Human',
					zh_Hans: '用户'
				}
			},
			variables: [
				{
					name: STATE_VARIABLE_INPUT,
					type: XpertParameterTypeEnum.STRING,
					description: {
						en_US: 'Input',
						zh_Hans: '输入'
					}
				},
				{
					name: STATE_VARIABLE_FILES,
					type: XpertParameterTypeEnum.ARRAY_FILE,
					description: {
						en_US: 'Files',
						zh_Hans: '文件'
					}
				}
			]
		})

		// System variables
		if (type !== 'input') {
			varGroups.push({
				group: {
					name: STATE_VARIABLE_SYS,
					description: {
						en_US: 'System Variables',
						zh_Hans: '系统变量'
					}
				},
				variables: [
					{
						name: `language`,
						type: XpertParameterTypeEnum.STRING,
						description: {
							en_US: 'Language',
							zh_Hans: '语言'
						}
					},
					{
						name: `user_email`,
						type: XpertParameterTypeEnum.STRING,
						description: {
							en_US: 'User email',
							zh_Hans: '用户邮箱'
						}
					},
					{
						name: `timezone`,
						type: XpertParameterTypeEnum.STRING,
						description: {
							en_US: 'User time zone',
							zh_Hans: '用户时区'
						}
					},
					{
						name: `date`,
						type: XpertParameterTypeEnum.STRING,
						description: {
							en_US: 'Current Date',
							zh_Hans: '当前日期'
						}
					},
					{
						name: `datetime`,
						type: XpertParameterTypeEnum.STRING,
						description: {
							en_US: 'Current Datetime',
							zh_Hans: '当前时间'
						}
					},
					{
						name: `common_times`,
						type: XpertParameterTypeEnum.STRING,
						description: {
							en_US: 'Common Times',
							zh_Hans: '常用时间'
						}
					},
					{
						name: 'workspace_path',
						type: XpertParameterTypeEnum.STRING,
						description: {
							en_US: 'Workspace Path',
							zh_Hans: '工作区路径'
						}
					},
					{
						name: 'workspace_url',
						type: XpertParameterTypeEnum.STRING,
						description: {
							en_US: 'Workspace URL',
							zh_Hans: '工作区 URL'
						}
					}
				]
			})
		}

		// Xpert state variables
		const agentConfig = isDraft ? (xpert.draft?.team?.agentConfig ?? xpert.agentConfig) : xpert.agentConfig
		const stateVariables = agentConfig?.stateVariables
		if (stateVariables) {
			variables.push(...stateVariables)
		}

		// All agents output
		const _graph = isDraft ? ({ ...(xpert.graph ?? {}), ...(xpert.draft ?? {}) } as TXpertGraph) : xpert.graph
		const node = _graph.nodes?.find((_) => _.key === nodeKey)
		const graph = _graph.nodes ? getCurrentGraph(_graph, nodeKey) : _graph

		// Current agent variables (parameters)
		if (nodeKey && node?.type === 'agent' && type === 'input') {
			const _variables = await this.getAgentVariables(xpert, nodeKey, isDraft)
			variables.push(..._variables)
			// Current agent variable group
			// varGroups.push(getAgentVarGroup(node.key, graph))
		}

		if (type === 'input') {
			return varGroups
		}

		// Other agents
		const agentNodes = graph?.nodes?.filter((_) => _.type === 'agent')
		if (agentNodes) {
			for await (const node of agentNodes) {
				const g = getAgentVarGroup(node.key, graph)
				varGroups.push(g)

				// const agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(
				// 	new GetXpertAgentQuery(xpertId, node.key, isDraft)
				// )
				const agent = getXpertAgent(xpert, node.key, { isDraft })

				// Add parameters of agent into global variables
				if (agent.parameters) {
					variables.push(...agent.parameters.filter((_) => _.name).map(xpertParameterToVariable))
				}

				// Add toolset's states into global variables
				const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, BaseToolset[]>(
					new ToolsetGetToolsCommand(agent.toolsetIds)
				)
				for await (const toolset of toolsets) {
					const toolVars = await toolset.getVariables()
					if (toolVars) {
						variables.push(...toolVars.map(toolsetVariableToVariable))
					}
				}
			}
		}

		// Workflow nodes
		const workflowNodes = graph?.nodes?.filter((_) => _.type === 'workflow' && _.key !== nodeKey)
		if (workflowNodes) {
			for await (const node of workflowNodes) {
				const entity = node.entity as IWorkflowNode
				const variables: TXpertParameter[] = []
				const varGroup: TWorkflowVarGroup = {
					group: {
						name: channelName(entity.key),
						description: entity.title || {
							en_US: entity.key
						}
					},
					variables
				}

				switch (entity.type) {
					case WorkflowNodeTypeEnum.TRIGGER: {
						variables.push(...triggerOutputVariables(entity))
						varGroups.push(varGroup)
						break
					}
					case WorkflowNodeTypeEnum.CODE: {
						variables.push(...codeOutputVariables(entity))
						varGroups.push(varGroup)
						break
					}
					case WorkflowNodeTypeEnum.HTTP: {
						variables.push(...httpOutoutVariables())
						varGroups.push(varGroup)
						break
					}
					case WorkflowNodeTypeEnum.KNOWLEDGE: {
						variables.push(...knowledgeOutputVariables(entity as IWFNKnowledgeRetrieval))
						varGroups.push(varGroup)
						break
					}
					case WorkflowNodeTypeEnum.SUBFLOW: {
						variables.push(...subflowOutputVariables(entity as IWFNSubflow))
						varGroups.push(varGroup)
						break
					}
					case WorkflowNodeTypeEnum.ITERATING: {
						variables.push(...iteratingOutputVariables(entity as IWFNIterating))
						varGroups.push(varGroup)
						break
					}
					case WorkflowNodeTypeEnum.TEMPLATE: {
						variables.push(...templateOutputVariables(entity))
						varGroups.push(varGroup)
						break
					}
					case WorkflowNodeTypeEnum.CLASSIFIER: {
						variables.push(...classifierOutputVariables(entity))
						varGroups.push(varGroup)
						break
					}
					case WorkflowNodeTypeEnum.TOOL: {
						variables.push(...toolOutputVariables(entity))
						varGroups.push(varGroup)
						break
					}
					case WorkflowNodeTypeEnum.ANSWER: {
						variables.push(...answerOutputVariables(entity))
						varGroups.push(varGroup)
						break
					}
					case WorkflowNodeTypeEnum.AGENT_TOOL: {
						variables.push(...agentToolOutputVariables(entity))
						varGroups.push(varGroup)
						break
					}
				}
			}
		}

		return varGroups
	}

	/**
	 * Toolset's state variables and parameters of Agent node
	 */
	async getAgentVariables(xpert: IXpert, key: string, isDraft: boolean) {
		const variables = []

		const agent = getXpertAgent(xpert, key, { isDraft })

		if (!agent) {
			return variables
		}

		const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, BaseToolset[]>(
			new ToolsetGetToolsCommand(agent.toolsetIds)
		)

		if (agent.parameters) {
			variables.push(...agent.parameters.filter((_) => _.name).map(xpertParameterToVariable))
		}

		for await (const toolset of toolsets) {
			const toolVars = await toolset.getVariables()
			if (toolVars) {
				variables.push(...toolVars.map(toolsetVariableToVariable))
			}
		}

		return variables
	}
}

function xpertParameterToVariable(parameter: TXpertParameter) {
	return parameter as TStateVariable
}
function toolsetVariableToVariable(variable: TStateVariable) {
	return omit(variable, 'reducer', 'default') as TStateVariable
}
