import type { TFollowUpConsumedEvent, TMessageContentComplex, TThreadContextUsageEvent } from '@xpert-ai/chatkit-types'
import type { IChatConversation } from './chat.model'
import type { IChatMessage } from './chat-message.model'
import type { IXpertAgentExecution } from './xpert-agent-execution.model'

/**
 * Business roles for AI copilot (commands or contexts)
 */
export enum AiBusinessRole {
  FinanceBP = 'finance_bp',
  SupplyChainExpert = 'supply_chain_expert'
}

/**
 * Providers for LLMs
 *
 * - https://js.langchain.com/docs/integrations/chat/
 */
export enum AiProvider {
  /**
   * - https://js.langchain.com/docs/integrations/chat/openai/
   */
  OpenAI = 'openai',
  /**
   * - https://js.langchain.com/docs/integrations/chat/openai/
   */
  Azure = 'azure',
  // DashScope = 'dashscope',
  /**
   * - https://ollama.com/
   * - https://js.langchain.com/docs/integrations/chat/ollama/
   */
  Ollama = 'ollama',
  /**
   * - https://www.deepseek.com/zh
   * - https://js.langchain.com/docs/integrations/chat/openai/
   */
  DeepSeek = 'deepseek',
  /**
   * - https://docs.anthropic.com/en/home
   * - https://js.langchain.com/docs/integrations/chat/anthropic/
   */
  Anthropic = 'anthropic',
  /**
   * - https://www.aliyun.com/product/bailian
   * - https://js.langchain.com/docs/integrations/chat/alibaba_tongyi/
   */
  AlibabaTongyi = 'alibaba_tongyi',
  /**
   * - https://open.bigmodel.cn/
   * - https://js.langchain.com/docs/integrations/chat/openai/
   */
  Zhipu = 'zhipu',
  /**
   * - https://qianfan.cloud.baidu.com/
   * - https://js.langchain.com/docs/integrations/chat/baidu_qianfan/
   */
  BaiduQianfan = 'baidu_qianfan',
  /**
   * - https://www.together.ai/
   * - https://js.langchain.com/docs/integrations/chat/togetherai/
   */
  Together = 'together',
  /**
   * - https://platform.moonshot.cn/console
   * - https://js.langchain.com/docs/integrations/chat/openai/
   */
  Moonshot = 'moonshot',
  /**
   * - https://groq.com/
   * - https://js.langchain.com/docs/integrations/chat/openai/
   */
  Groq = 'groq',
  /**
   * - https://mistral.ai/
   *
   */
  Mistral = 'mistral',
  /**
   * - https://cohere.com/
   */
  Cohere = 'cohere'
}

export enum AiProtocol {
  OpenAI = 'openai',
  Others = 'others'
}

export const OpenAIEmbeddingsProviders = [AiProvider.OpenAI, AiProvider.Azure, AiProvider.DeepSeek]
export const OllamaEmbeddingsProviders = [AiProvider.Ollama]

export enum ChatMessageTypeEnum {
  MESSAGE = 'message',
  EVENT = 'event'
}

export enum ChatMessageEventTypeEnum {
  ON_CONVERSATION_START = 'on_conversation_start',
  ON_CONVERSATION_END = 'on_conversation_end',
  ON_MESSAGE_START = 'on_message_start',
  ON_MESSAGE_END = 'on_message_end',
  ON_TOOL_START = 'on_tool_start',
  ON_TOOL_END = 'on_tool_end',
  ON_TOOL_ERROR = 'on_tool_error',
  ON_TOOL_MESSAGE = 'on_tool_message',
  ON_AGENT_START = 'on_agent_start',
  ON_AGENT_END = 'on_agent_end',
  ON_RETRIEVER_START = 'on_retriever_start',
  ON_RETRIEVER_END = 'on_retriever_end',
  ON_RETRIEVER_ERROR = 'on_retriever_error',
  ON_INTERRUPT = 'on_interrupt',
  ON_ERROR = 'on_error',
  ON_CHAT_EVENT = 'on_chat_event',
  ON_CLIENT_EFFECT = 'on_client_effect'
}

export enum ChatMessageStepCategory {
  List = 'list',
  WebSearch = 'web_search',
  Files = 'files',
  File = 'file',
  Program = 'program',
  Iframe = 'iframe',
  Memory = 'memory',
  Tasks = 'tasks',
  Knowledges = 'knowledges'
}

export type TChatStreamMessagePayload = {
  type: ChatMessageTypeEnum.MESSAGE
  data: string | TMessageContentComplex
}

export type TChatStreamConversationPayload = {
  type: ChatMessageTypeEnum.EVENT
  event: ChatMessageEventTypeEnum.ON_CONVERSATION_START | ChatMessageEventTypeEnum.ON_CONVERSATION_END
  data: Partial<IChatConversation>
}

export type TChatStreamMessageLifecyclePayload = {
  type: ChatMessageTypeEnum.EVENT
  event: ChatMessageEventTypeEnum.ON_MESSAGE_START | ChatMessageEventTypeEnum.ON_MESSAGE_END
  data: Partial<IChatMessage>
}

export type TChatStreamAgentEndPayload = {
  type: ChatMessageTypeEnum.EVENT
  event: ChatMessageEventTypeEnum.ON_AGENT_END
  data: Partial<IXpertAgentExecution>
}

export type TChatStreamErrorPayload = {
  type: ChatMessageTypeEnum.EVENT
  event: ChatMessageEventTypeEnum.ON_ERROR
  data: string | { error?: string }
}

export type TChatStreamChatEventData =
  | NonNullable<IChatMessage['events']>[number]
  | TFollowUpConsumedEvent
  | TThreadContextUsageEvent

export type TChatStreamChatEventPayload = {
  type: ChatMessageTypeEnum.EVENT
  event: ChatMessageEventTypeEnum.ON_CHAT_EVENT
  data: TChatStreamChatEventData
}

export type TChatStreamUnhandledEventPayload = {
  type: ChatMessageTypeEnum.EVENT
  event: Exclude<
    ChatMessageEventTypeEnum,
    | ChatMessageEventTypeEnum.ON_CONVERSATION_START
    | ChatMessageEventTypeEnum.ON_CONVERSATION_END
    | ChatMessageEventTypeEnum.ON_MESSAGE_START
    | ChatMessageEventTypeEnum.ON_MESSAGE_END
    | ChatMessageEventTypeEnum.ON_AGENT_END
    | ChatMessageEventTypeEnum.ON_ERROR
    | ChatMessageEventTypeEnum.ON_CHAT_EVENT
  >
  data?:
    | Partial<IChatConversation>
    | Partial<IChatMessage>
    | Partial<IXpertAgentExecution>
    | TChatStreamChatEventData
    | string
}

export type TChatStreamEventPayload =
  | TChatStreamMessagePayload
  | TChatStreamConversationPayload
  | TChatStreamMessageLifecyclePayload
  | TChatStreamAgentEndPayload
  | TChatStreamErrorPayload
  | TChatStreamChatEventPayload
  | TChatStreamUnhandledEventPayload

export type TChatStreamCompletePayload = {
  type: 'complete'
}

export type TChatStreamPayload = TChatStreamEventPayload | TChatStreamCompletePayload
