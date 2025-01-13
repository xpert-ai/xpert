import { ICopilot, ILLMUsage } from "@metad/contracts"

export const PROVIDE_AI_MODEL_LLM = 'provide_ai_model_llm'
export const PROVIDE_AI_MODEL_MODERATION = 'provide_ai_model_moderation'
export const PROVIDE_AI_MODEL_SPEECH2TEXT = 'provide_ai_model_speech2text'
export const PROVIDE_AI_MODEL_TEXT_EMBEDDING = 'provide_ai_model_text_embedding'

export type TChatModelOptions = {
    modelProperties: Record<string, any>;
    handleLLMTokens: (input: {
        copilot: ICopilot;
        model?: string;
        usage?: ILLMUsage;
        /**
         * @deprecated use usage
         */
        tokenUsed?: number
    }) => void;
}

export const ModelProvidersFolderPath = 'packages/server-ai/src/ai-model/model_providers'