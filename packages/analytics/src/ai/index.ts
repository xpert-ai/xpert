import { BUILTIN_TOOLSET_REPOSITORY } from '@metad/server-ai'
import { ChatBIToolset, ChatDBToolset } from './toolset/builtin'

BUILTIN_TOOLSET_REPOSITORY.splice(0, 0, {
	baseUrl: `packages/analytics/src/ai/toolset/builtin`,
	providers: [ ChatBIToolset, ChatDBToolset, ]
})

export { ChatBIToolset, ChatDBToolset }
