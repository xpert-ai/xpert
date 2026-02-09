import { IXpertToolset } from '@metad/contracts'
import { Type } from '@nestjs/common'
import { ToolProviderNotFoundError } from '../../errors'
import { ToolsetFolderPath } from '../../types'
import { BingToolset } from './bing/bing'
import { DingTalkToolset } from './dingtalk/dingtalk'
import { DiscordToolset } from './discord/discord'
import { DuckDuckGoToolset } from './duckduckgo/duckduckgo'
import { EmailToolset } from './email/email'
import { SearchAPIToolset } from './searchapi/searchapi'
import { SerpAPIToolset } from './serpapi/serpapi'
import { SerperToolset } from './serper/serper'
import { SlackToolset } from './slack/slack'
import { TaskToolset } from './task/task'
import { TavilyToolset } from './tavily/tavily'
import { PlanningToolset } from './planning/planning'
import { CreateToolsetCommand } from '../../commands'
import { TBuiltinToolsetParams } from '@xpert-ai/plugin-sdk'

export * from './builtin-tool'

export const BUILTIN_TOOLSET_REPOSITORY: {
	baseUrl: string
	providers: Array<Type<any> & { provider: string }>
}[] = [
	{
		baseUrl: ToolsetFolderPath,
		providers: [
			TaskToolset,
			PlanningToolset,
			TavilyToolset,
			SearchAPIToolset,
			SerpAPIToolset,
			EmailToolset,
			DuckDuckGoToolset,
			BingToolset,
			DingTalkToolset,
			SlackToolset,
			DiscordToolset,
			SerperToolset,
		]
	}
]

export function getBuiltinToolsetBaseUrl(name: string) {
	return BUILTIN_TOOLSET_REPOSITORY.find((item) => item.providers.some((_) => _.provider === name))?.baseUrl
}

export async function createBuiltinToolset(provider: string, toolset?: IXpertToolset, params?: TBuiltinToolsetParams) {
	let providerTypeClass = null
	BUILTIN_TOOLSET_REPOSITORY.find((item) => {
		providerTypeClass = item.providers.find((_) => _.provider === provider)
		return !!providerTypeClass
	})

	if (providerTypeClass) {
		return new providerTypeClass(toolset, params)
	} else {
		return await params?.commandBus.execute(new CreateToolsetCommand({
			...(toolset ?? { type: provider } as IXpertToolset)
		}, params))
	}

	throw new ToolProviderNotFoundError(`Builtin tool provider '${provider}' not found!`)
}
