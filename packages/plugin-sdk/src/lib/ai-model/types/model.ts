import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIModelEntity, ICopilot, ICopilotModel, ILLMUsage, ParameterType, PriceInfo, PriceType } from "@metad/contracts"


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
    verbose: boolean
}

export interface IAIModel {
    validateCredentials(model: string, credentials: Record<string, any>): Promise<void>
    getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel
    predefinedModels(): AIModelEntity[]
    getPrice(
		model: string,
		credentials: Record<string, any>,
		priceType: PriceType,
		tokens: number
	): PriceInfo
}

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

export function mergeCredentials(credentials, modelProperties) {
    return {
        ...(credentials ?? {}),
        ...(modelProperties ?? {}),
    }
}

export type TModelProperties = {
    endpoint_url: string
    api_key: string
    endpoint_model_name?: string
}