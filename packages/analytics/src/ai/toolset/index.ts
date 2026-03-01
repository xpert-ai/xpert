import { BUILTIN_TOOLSET_REPOSITORY } from '@metad/server-ai'
import {
	ChatBIToolset,
	ChatDBToolset,
	IndicatorsToolset,
	SemanticModelToolset
} from './builtin'

BUILTIN_TOOLSET_REPOSITORY.splice(0, 0, {
	baseUrl: `packages/analytics/src/ai/toolset/builtin`,
	providers: [
		ChatBIToolset,
		ChatDBToolset,
		IndicatorsToolset,
		SemanticModelToolset
	]
})

export { ChatBIToolset, ChatDBToolset, IndicatorsToolset, SemanticModelToolset }
