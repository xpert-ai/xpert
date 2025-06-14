import { BaseMessage } from '@langchain/core/messages'
import { Subscriber } from 'rxjs'
import { TMessageContentComplex } from '../ai/chat-message.model'
import { agentLabel, IXpertAgent, TStateVariable, TWorkflowVarGroup, TXpertGraph, TXpertParameter, TXpertTeamNode, XpertParameterTypeEnum } from '../ai'

export const CONTEXT_VARIABLE_CURRENTSTATE = 'currentState'
export const STATE_VARIABLE_SYS = 'sys'
export const STATE_VARIABLE_HUMAN = 'human'
export const GRAPH_NODE_SUMMARIZE_CONVERSATION = 'summarize_conversation'
export const GRAPH_NODE_TITLE_CONVERSATION = 'title_conversation'
export const STATE_VARIABLE_FILES = 'files'
export const STATE_VARIABLE_INPUT = 'input'
export const STATE_VARIABLE_TITLE_CHANNEL = channelName('title')

export type TMessageChannel = {
  messages: BaseMessage[]
  summary?: string
}

export type TAgentRunnableConfigurable = {
  /**
   * Thread id
   */
  thread_id: string
  checkpoint_ns: string
  checkpoint_id: string
  // Custom configurable of invoke
  tenantId: string
  organizationId: string
  language: string
  userId: string
  /**
   * Xpert project id
   */
  projectId?: string
  // Caller
  agentKey: string
  xpertName?: string
  subscriber: Subscriber<any>
  /**
   * Execution id of agent workflow node
   */
  executionId: string

  signal?: AbortSignal
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

export function getAgentVarGroup(key: string, graph: TXpertGraph): TWorkflowVarGroup {
	const agent = graph.nodes.find((_) => _.type === 'agent' && _.key === key) as TXpertTeamNode & {type: 'agent'}

	const variables: TXpertParameter[] = []
	const varGroup: TWorkflowVarGroup = {
		// agent: {
		// 	title: agent.entity.title,
		// 	description: agent.entity.description,
		// 	name: agent.entity.name || agent.entity.key,
		// 	key: channelName(agent.key)
		// },
		group: {
			name: channelName(agent.key),
			description: {
				en_US: agentLabel(agent.entity)
			},
		},
		variables
	}

	variables.push({
		name: `output`,
		type: XpertParameterTypeEnum.STRING,
		description: {
			zh_Hans: `输出`,
			en_US: `Output`
		}
	})
	if ((<IXpertAgent>agent.entity).outputVariables) {
		(<IXpertAgent>agent.entity).outputVariables.forEach((variable) => {
			variables.push({
				name: variable.name,
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
