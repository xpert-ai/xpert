export * from './errors'

import { JinaProviderModule } from './jina/jina'
import { OllamaProviderModule } from './ollama/ollama'

export const ProviderModules = [
	OllamaProviderModule,
	JinaProviderModule,
]