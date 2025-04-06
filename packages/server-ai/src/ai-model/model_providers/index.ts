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
import { JinaProviderModule } from './jina/jina'
import { MistralAIProviderModule } from './mistralai/mistralai'
import { MoonshotProviderModule } from './moonshot/moonshot'
import { OllamaProviderModule } from './ollama/ollama'
import { OpenAIProviderModule } from './openai/openai'
import { OAICompatProviderModule } from './openai_api_compatible/openai_api_compatible'
import { OpenRouterProviderModule } from './openrouter/openrouter'
import { SiliconflowProviderModule } from './siliconflow/siliconflow'
import { SparkProviderModule } from './spark/spark'
import { TogetherAIProviderModule } from './togetherai/togetherai'
import { TongyiProviderModule } from './tongyi/tongyi'
import { VolcengineMaaSProviderModule } from './volcengine_maas/volcengine_maas'
import { XAIProviderModule } from './x/x'
import { XinferenceProviderModule } from './xinference/xinference'
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
	XAIProviderModule,
	OpenRouterProviderModule,
	OAICompatProviderModule,
	VolcengineMaaSProviderModule,
	SparkProviderModule,
	SiliconflowProviderModule,
	JinaProviderModule,
	XinferenceProviderModule
]