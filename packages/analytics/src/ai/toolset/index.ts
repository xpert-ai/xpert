import { BUILTIN_TOOLSET_REPOSITORY } from '@metad/server-ai'
import {
	ChatBILarkToolset,
	ChatBIToolset,
	ChatBIWeComToolset,
	ChatDBToolset,
	IndicatorsToolset,
	SemanticModelToolset
} from './builtin'

BUILTIN_TOOLSET_REPOSITORY.splice(0, 0, {
	baseUrl: `packages/analytics/src/ai/toolset/builtin`,
	providers: [
		ChatBIToolset,
		ChatDBToolset,
		ChatBILarkToolset,
		IndicatorsToolset,
		ChatBIWeComToolset,
		SemanticModelToolset
	]
})

export { ChatBILarkToolset, ChatBIToolset, ChatBIWeComToolset, ChatDBToolset, IndicatorsToolset, SemanticModelToolset }
