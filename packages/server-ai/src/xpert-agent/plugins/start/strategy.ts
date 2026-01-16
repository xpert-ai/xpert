import { RunnableLambda } from '@langchain/core/runnables'
import {
	channelName,
	IEnvironment,
	IWorkflowNode,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertParameter,
	TXpertTeamNode,
	WorkflowNodeTypeEnum
} from '@metad/contracts'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { IWorkflowNodeStrategy, WorkflowNodeStrategy } from '@xpert-ai/plugin-sdk'
import { AgentStateAnnotation } from '../../../shared'


@Injectable()
@WorkflowNodeStrategy(WorkflowNodeTypeEnum.START)
export class WorkflowStartNodeStrategy implements IWorkflowNodeStrategy {
	readonly #logger = new Logger(WorkflowStartNodeStrategy.name)

	@Inject(CommandBus)
	private readonly commandBus: CommandBus

	@Inject(QueryBus)
	private readonly queryBus: QueryBus

	readonly meta = {
		name: WorkflowNodeTypeEnum.START,
		label: {
			en_US: 'Start',
			zh_Hans: '开始'
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

		return {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { subscriber, executionId } = configurable

				return {
					[channelName(node.key)]: {}
				}
			}),
			ends: []
		}
	}

	outputVariables(entity: IWorkflowNode): TXpertParameter[] {
		return []
	}
}
