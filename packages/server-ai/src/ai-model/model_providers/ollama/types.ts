import { CommonChatModelParameters } from "../../llm"

export interface OllamaCredentials {
    base_url: string
}

export interface OllamaModelCredentials extends CommonChatModelParameters {
    streaming?: boolean
    mode: string
    context_size: number
    max_tokens: number
    vision_support: boolean
}