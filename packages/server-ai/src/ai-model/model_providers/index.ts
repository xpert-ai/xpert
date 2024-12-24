export * from './errors'

import { AnthropicProviderModule } from './anthropic/anthropic'
import { AzureAIStudioProviderModule } from './azure_ai_studio/azure_ai_studio'
import { BaichuanProviderModule } from './baichuan/baichuan'
import { CohereProviderModule } from './cohere/cohere'
import { DeepseekProviderModule } from './deepseek/deepseek'
import { GoogleProviderModule } from './google/google'
import { GroqProviderModule } from './groq/groq'
import { HuggingfaceHubProviderModule } from './huggingface_hub/huggingface_hub'
import { HunyuanProviderModule } from './hunyuan/hunyuan'
import { MistralAIProviderModule } from './mistralai/mistralai'
import { MoonshotProviderModule } from './moonshot/moonshot'
import { OllamaProviderModule } from './ollama/ollama'
import { OpenAIProviderModule } from './openai/openai'
import { TogetherAIProviderModule } from './togetherai/togetherai'
import { TongyiProviderModule } from './tongyi/tongyi'
import { XAIProviderModule } from './x/x'
import { ZhipuaiProviderModule } from './zhipuai/zhipuai'

export const ProviderModules = [
	OpenAIProviderModule,
	OllamaProviderModule,
	DeepseekProviderModule,
	AnthropicProviderModule,
	BaichuanProviderModule,
	AzureAIStudioProviderModule,
	ZhipuaiProviderModule,
	TogetherAIProviderModule,
	CohereProviderModule,
	GoogleProviderModule,
	GroqProviderModule,
	HunyuanProviderModule,
    MistralAIProviderModule,
    MoonshotProviderModule,
	TongyiProviderModule,
	HuggingfaceHubProviderModule,
	XAIProviderModule
]