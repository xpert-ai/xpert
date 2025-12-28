import { BaseMessage } from '@langchain/core/messages'
import { RunnableConfig } from '@langchain/core/runnables'
import { TMessageContentComplex } from '@xpert-ai/chatkit-types'
import { Subscriber } from 'rxjs'
import { IWFNTrigger, TWorkflowVarGroup, WorkflowNodeTypeEnum } from '../ai/xpert-workflow.model'
import { TStateVariable, TXpertGraph, TXpertParameter, TXpertTeamNode, XpertParameterTypeEnum } from '../ai/xpert.model'
import { agentLabel, IXpertAgent } from '../ai/xpert-agent.model'

/**
 * @deprecated can use getCurrentTaskInput instead?
 */
export const CONTEXT_VARIABLE_CURRENTSTATE = 'currentState'
export const STATE_VARIABLE_SYS = 'sys'
export const STATE_VARIABLE_HUMAN = 'human'
export const GRAPH_NODE_SUMMARIZE_CONVERSATION = 'summarize_conversation'
export const GRAPH_NODE_TITLE_CONVERSATION = 'title_conversation'
export const STATE_VARIABLE_FILES = 'files'
export const STATE_VARIABLE_INPUT = 'input'
export const STATE_SYS_VOLUME = 'volume'
export const STATE_SYS_WORKSPACE_PATH = 'workspace_path'
export const STATE_SYS_WORKSPACE_URL = 'workspace_url'
export const STATE_VARIABLE_TITLE_CHANNEL = channelName('title')

export type TMessageChannel = {
  system: string
  messages: BaseMessage[]
  summary?: string
  error?: string | null
}

export type TAgentRunnableConfigurable = {
  /**
   * Thread id
   */
  thread_id: string
  checkpoint_ns: string
  checkpoint_id: string
  tool_call_id?: string

  // Custom configurable of invoke
  tenantId: string
  organizationId: string
  language: string
  userId: string
  /**
   * Xpert project id
   */
  projectId?: string
  xpertId?: string
  // Caller
  agentKey: string
  xpertName?: string
  toolName?: string

  subscriber: Subscriber<any>
  /**
   * Execution id of agent workflow node
   */
  executionId: string
//   /**
//    * Knowledge xpert's knowledgebase
//    */
//   knowledgebaseId?: string
//   knowledgeTaskId?: string
  
  signal?: AbortSignal
}

/**
 * @deprecated use import { type ToolCall } from '@langchain/core/messages/tool';
 */
export type TToolCall = {
	id?: string
	name: string
	type?: 'tool_call'
	args: Record<string, any>
}

// Helpers
export function channelName(name: string) {
	return name.toLowerCase() + '_channel'
}

export function messageContentText(content: string | TMessageContentComplex) {
	return typeof content === 'string' ? content : content.type === 'text' ? content.text : ''
}

export function getWorkspaceFromRunnable(configurable: TAgentRunnableConfigurable): {type?: 'project' | 'conversation'; id?: string} {
	return configurable?.projectId  ? {type: 'project', id: ''} : 
		configurable?.thread_id ? {
			type: 'conversation',
			id: configurable.thread_id
		} : {}
  }

export function getToolCallFromConfig(config): TToolCall {
	return config?.toolCall	|| config?.configurable?.toolCall
}

export function getToolCallIdFromConfig(config): string {
	return config.metadata?.tool_call_id || config?.configurable?.tool_call_id || getToolCallFromConfig(config)?.id 
}

/**
 * Compute long-term memory namespace:
 * 1. When a user talks to a digital expert individually, use `ExpertId` + `UserId` to store memory
 * 2. When talking to a digital expert in a project, all users and digital experts share `ProjectId` to store memory
 * 
 * @param config 
 * @returns 
 */
export function getStoreNamespace(config: RunnableConfig): string[] {
	const configurable = config.configurable as TAgentRunnableConfigurable
	return configurableStoreNamespace(configurable)
}

export function configurableStoreNamespace(configurable: Partial<TAgentRunnableConfigurable>): string[] {
	return configurable?.projectId ? [configurable?.projectId] : configurable?.userId ? [configurable.xpertId, configurable.userId] : []
}

/**
 * Set value into variable of state.
 * 
 * @param state 
 * @param varName 
 * @param value 
 * @returns 
 */
export function setStateVariable(state: Record<string, any>, varName: string, value: any) {
	const [agentChannelName, variableName] = varName.split('.')
	if (variableName) {
		state[agentChannelName] = {
			...(state[agentChannelName] ?? {}),
			[variableName]: value
		}
	} else {
		state[agentChannelName] = value
	}

	return state
}

/**
 * Get agent variable group from graph.
 * 
 * @param key 
 * @param graph 
 * @returns 
 */
export function getAgentVarGroup(key: string, graph: TXpertGraph): TWorkflowVarGroup {
	const node = graph.nodes.find((_) => _.type === 'agent' && _.key === key) as TXpertTeamNode & {type: 'agent'}

	const variables: TXpertParameter[] = []
	const varGroup: TWorkflowVarGroup = {
		group: {
			name: channelName(node.key),
			description: {
				en_US: agentLabel(node.entity)
			},
		},
		variables
	}

	variables.push({
		name: `messages`,
		type: XpertParameterTypeEnum.ARRAY,
		description: {
			zh_Hans: `消息列表`,
			en_US: `Message List`
		}
	})
	variables.push({
		name: `output`,
		type: XpertParameterTypeEnum.STRING,
		description: {
			zh_Hans: `输出`,
			en_US: `Output`
		}
	})
	variables.push({
		name: `error`,
		type: XpertParameterTypeEnum.STRING,
		description: {
			zh_Hans: `错误`,
			en_US: `Error`
		}
	})
	const agent = <IXpertAgent>node.entity
	if (agent.options?.structuredOutputMethod && agent.outputVariables) {
		agent.outputVariables.forEach((variable) => {
			variables.push({
				name: variable.name || '',
				type: variable.type as TStateVariable['type'],
				description: variable.description,
				item: variable.item
			})
		})
	}

	return varGroup
}


// Swarm
/**
 * Get swarm partners of agent in team
 * 
 * @param graph 
 * @param agentKey 
 */
export function getSwarmPartners(graph: TXpertGraph, agentKey: string, partners: string[], leaderKey?: string) {
  const connections = graph.connections.filter((conn) => conn.type === 'agent' && conn.to === agentKey && (leaderKey ? conn.from !== leaderKey : true)
		&& graph.connections.some((_) => _.type === 'agent' && _.to === conn.from && _.from === agentKey))

  connections.forEach((conn) => {
	const key = conn.from
	if (partners.indexOf(key) < 0) {
		partners.push(key)
		getSwarmPartners(graph, key, partners)
	}
  })
  return partners
}

export function getWorkflowTriggers(graph: TXpertGraph, from: string) {
	return graph.nodes.filter((node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.TRIGGER && (<IWFNTrigger>node.entity).from === from)
}