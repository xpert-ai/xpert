import { AiProvider } from "../agent"

/**
 * Business roles for AI copilot (commands or contexts)
 */
export enum AiBusinessRole {
    FinanceBP = 'finance_bp',
    SupplyChainExpert = 'supply_chain_expert',
}

export const OpenAIEmbeddingsProviders = [AiProvider.OpenAI, AiProvider.Azure, AiProvider.DeepSeek]
export const OllamaEmbeddingsProviders = [AiProvider.Ollama]