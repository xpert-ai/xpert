import { ICopilot, ILLMUsage, ParameterType } from "@metad/contracts"

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

export const CommonParameterRules = [
    {
        name: 'temperature',
        label: {
            zh_Hans: '温度',
            en_US: `Temperature`
        },
        type: ParameterType.FLOAT,
        help: {
            zh_Hans: '控制模型输出的随机性。较高的值（例如 1.0）使响应更具创意，而较低的值（例如 0.1）使响应更具确定性和重点性。',
            en_US: `Controls the randomness of the model's output. A higher value (e.g., 1.0) makes responses more creative, while a lower value (e.g., 0.1) makes them more deterministic and focused.`
        },
        required: false,
        default: 0.2,
        min: 0,
        max: 1,
        precision: 0.1,
    },
    {
        label: {
            zh_Hans: '最大尝试次数',
            en_US: 'The maximum number of attempts'
        },
        type: ParameterType.INT,
        help: {
            zh_Hans: '如果请求由于网络超时或速率限制等问题而失败，系统将尝试重新发送请求的最大次数',
            en_US: 'The maximum number of attempts the system will make to resend a request if it fails due to issues like network timeouts or rate limits'
        },
        required: false,
        default: 6,
        min: 0,
        max: 10,
        precision: 0,
        name: 'maxRetries',
    },
]