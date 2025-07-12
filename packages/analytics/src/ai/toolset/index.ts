import { BUILTIN_TOOLSET_REPOSITORY } from '@metad/server-ai'
import { ChatBILarkToolset, ChatBIToolset, ChatBIWeComToolset, ChatDBToolset, IndicatorsToolset } from './builtin'

BUILTIN_TOOLSET_REPOSITORY.splice(0, 0, {
	baseUrl: `packages/analytics/src/ai/toolset/builtin`,
	providers: [ ChatBIToolset, ChatDBToolset, ChatBILarkToolset, IndicatorsToolset, ChatBIWeComToolset ]
})

export { ChatBIToolset, ChatDBToolset, ChatBILarkToolset, IndicatorsToolset, ChatBIWeComToolset }
