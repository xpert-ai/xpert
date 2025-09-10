/**
 * Business roles for AI copilot (commands or contexts)
 */
export enum AiBusinessRole {
    FinanceBP = 'finance_bp',
    SupplyChainExpert = 'supply_chain_expert',
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
  Cohere = 'cohere',
  
}

export enum AiProtocol {
  OpenAI = 'openai',
  Others = 'others'
}

export const OpenAIEmbeddingsProviders = [AiProvider.OpenAI, AiProvider.Azure, AiProvider.DeepSeek]
export const OllamaEmbeddingsProviders = [AiProvider.Ollama]