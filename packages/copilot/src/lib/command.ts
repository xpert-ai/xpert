import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseStringPromptTemplate, ChatPromptTemplate } from '@langchain/core/prompts'
import { BaseRetriever } from '@langchain/core/retrievers'
import { DynamicStructuredTool, DynamicTool } from '@langchain/core/tools'
import { BaseCheckpointSaver, CompiledStateGraph, StateGraph } from '@langchain/langgraph'
import { StateDefinition } from '@langchain/langgraph/dist/graph/annotation'
import { ChannelReducers } from '@langchain/langgraph/dist/graph/state'
import { Observable } from 'rxjs'
import { CopilotChatMessage } from './types/types'

/**
 * Copilot command, which can execute multiple actions.
 */
export interface CopilotCommand<T extends StateDefinition = any> {
  /**
   * Hidden for debug
   */
  hidden?: boolean
  /**
   * Full name of the command
   */
  name?: string
  /**
   * Alias (short name) of the command
   */
  alias?: string
  /**
   * Description of the command
   */
  description: string

  examplesRetriever?: BaseRetriever
  /**
   * Input suggestions
   */
  suggestion?: {
    promptTemplate: ChatPromptTemplate
  }
  /**
   * @deprecated use prompt only
   */
  systemPrompt?: (options?: { params?: CopilotContextParam[] }) => Promise<string>
  /**
   *
   * @param args
   * @returns
   */
  implementation?: (...args: T[]) => Promise<void | string | CopilotChatMessage>
  /**
   * @deprecated use `tools` instead
   */
  actions?: string[]
  /**
   * Tools for agent (langchain)
   */
  tools?: Array<DynamicStructuredTool | DynamicTool>
  /**
   * Prompt template for Agent executor
   */
  prompt?: ChatPromptTemplate
  /**
   * The few shot prompt template to add examples for user input
   */
  fewShotPrompt?: BaseStringPromptTemplate

  agent?: {
    type: CopilotAgentType
    conversation?: boolean
    interruptBefore?: string[]
    interruptAfter?: string[]
    referencesRetriever?: BaseRetriever
  }

  createGraph?: (
    options: CreateGraphOptions
  ) => Promise<
    any // StateGraph<{ channels: ChannelReducers<T> }, T, Partial<T>, string> | CompiledStateGraph<T, Partial<T>, string>
  >

  // For history management
  historyCursor?: () => number
  revert?: (index: number) => Promise<void>
}

export type CreateGraphOptions = {
  llm: BaseChatModel
  secondaryChatModel?: BaseChatModel
  checkpointer?: BaseCheckpointSaver
  interruptBefore?: any[]
  interruptAfter?: any[]
}

/**
 * The type of agent for copilot command
 */
export enum CopilotAgentType {
  /**
   * Default use single agent
   */
  Default = 'Default',
  /**
   * Graph use multiple agents (LangGraph)
   */
  Graph = 'Graph',
  OpenAI = 'OpenAI',
  LangChain = 'LangChain'
}

export interface CopilotContext {
  commands(): Array<CopilotCommand>

  getContextObservable(): Observable<CopilotContextItem[]>
  getCommand(name: string): CopilotCommand | null
  getCommandWithContext(name: string): { command: CopilotCommand; context: CopilotContext } | null
  getContextItem(key: string): Promise<CopilotContextItem | null>
}

export interface CopilotContextItem<T = any> {
  key: string
  caption: string
  uKey: string
  serizalize(): Promise<string>
  value: T
}

export type CopilotContextParam = {
  content: string
  context: CopilotContext
  item: CopilotContextItem
}

export const SystemCommandClear = 'clear'
export const SystemCommandFree = 'free'
