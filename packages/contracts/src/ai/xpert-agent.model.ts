import { TInterruptCommand } from '@xpert-ai/chatkit-types'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { ICopilotModel, TCopilotModel } from './copilot-model.model'
import { IKnowledgebase, TKBRecallParams } from './knowledgebase.model'
import { I18nObject, TAvatar } from '../types'
import { IXpertToolset } from './xpert-toolset.model'
import { IXpert, TXpertParameter } from './xpert.model'
import { TVariableAssigner } from './xpert-workflow.model'
import { TErrorHandling } from './types'

export type TXpertAgent = {
  key: string
  name?: string
  title?: string
  description?: string
  avatar?: TAvatar
  /**
   * System prompt
   */
  prompt?: string
  /**
   * Prompt templates (ai or human)
   */
  promptTemplates?: TAgentPromptTemplate[]
  /**
   * Input parameters for agent
   */
  parameters?: TXpertParameter[]
  /**
   * Output variables of agent
   */
  outputVariables?: TAgentOutputVariable[]

  /**
   * More configuration
   */
  options?: TXpertAgentOptions

  // One to one
  /**
   * This is the xpert's primary agent
   */
  xpert?: IXpert
  xpertId?: string
  /**
   * Copilot model of this agent
   */
  copilotModel?: ICopilotModel
  copilotModelId?: string

  // Many to one
  /**
   * This is one of the xpert team's agent
   */
  team?: IXpert
  teamId?: string

  /**
   * My leader in xpert team
   */
  leader?: IXpertAgent
  leaderKey?: string
  /**
   * I am the leader of followers in xpert's team
   */
  followers?: IXpertAgent[]

  // Many to many
  /**
   * External xpert teams
   */
  collaborators?: IXpert[]
  collaboratorNames?: string[]
  /**
   * I used toolsets
   */
  toolsets?: IXpertToolset[]
  toolsetIds?: string[]
  /**
   * I used knowledgebases
   */
  knowledgebases?: IKnowledgebase[]
  knowledgebaseIds?: string[]
}

/**
 * Expert agent, ai agent for the xperts.
 */
export interface IXpertAgent extends IBasePerTenantAndOrganizationEntityModel, TXpertAgent {
  
}

export type TXpertAgentOptions = {
  /**
   * Hide this agent node in the graph
   */
  hidden?: boolean
  
  /**
   * Disable message history for agent conversation
   */
  disableMessageHistory?: boolean

  /**
   * The variable of message history to use
   */
  historyVariable?: string

  /**
   * Write output variables to memory (state)
   */
  memories?: TVariableAssigner[]

  /**
   * Whether to enable parallel tool calls, default: true
   */
  parallelToolCalls?: boolean

  /**
   * Retry on failure
   */
  retry?: {
    enabled?: boolean
    stopAfterAttempt?: number
  }

  /**
   * Fallback model
   */
  fallback?: {
    enabled?: boolean
    copilotModel?: TCopilotModel
  }

  /**
   * Error handling
   */
  errorHandling?: TErrorHandling

  /**
   * Recall params for kbs
   */
  recall?: TKBRecallParams

  /**
   * Available tools
   */
  availableTools?: Record<string, string[]>
  /**
   * Options for tools of agent
   */
  tools?: Record<string, {
    timeout?: number
  }>
  
  /**
   * How to achieve structured output (`StructuredOutputMethodOptions['method']`)
   * - *functionCalling*
   * - *jsonMode*
   * - *jsonSchema*
   * 
   */
  structuredOutputMethod?: "functionCalling" | "jsonMode" | "jsonSchema" | string
  /**
   * Vision config of agent
   */
  vision?: {
    enabled?: boolean
    /**
     * Variable name that store the list of files to be understood
     */
    variable?: string
    /**
     * Image resolution for vision tasks
     */
    resolution?: 'high' | 'low'
  }
  /**
   * Config of middlewares for agent
   */
  middlewares?: {
    order: string[]
  }
}

export type TAgentPromptTemplate = {
  id: string;
  role: 'ai' | 'human';
  text: string
}

export type TAgentOutputVariable = TXpertParameter & {
  /**
     * value write to state's variable
     */
  variableSelector: string
  /**
   * How to write value to variable
   */
  operation: 'append' | 'extends' | 'overwrite' | 'clear'
}

/**
 * @deprecated use TChatRequest
 */
export type TChatAgentParams = {
  input: {
    input?: string
    [key: string]: unknown
  }
  agentKey: string
  xpertId: string
  executionId?: string
  environmentId?: string
  /**
   */
  command?: TInterruptCommand
  /**
   * Reject the sensitive tool calls
   */
  reject?: boolean
}

export function agentLabel(agent: Partial<IXpertAgent>) {
  return agent.title || agent.name || agent.key
}

export function agentUniqueName(agent: IXpertAgent) {
  return agent ? (convertToUrlPath(agent.name) || agent.key) : null
}

export function convertToUrlPath(title: string) {
  return title?.toLowerCase() // Convert to lowercase
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^a-z0-9-]/g, ''); // Remove non-alphanumeric characters
}

export const VariableOperations: {
  value: TAgentOutputVariable['operation'];
  label: I18nObject
}[] = [
  {
    value: 'append',
    label: {
      zh_Hans: '追加',
      en_US: 'Append'
    }
  },
  {
    value: 'extends',
    label: {
      zh_Hans: '扩展',
      en_US: 'Extend'
    }
  },
  {
    value: 'overwrite',
    label: {
      zh_Hans: '覆盖',
      en_US: 'Overwrite'
    }
  },
  {
    value: 'clear',
    label: {
      zh_Hans: '清除',
      en_US: 'Clear'
    }
  }
]