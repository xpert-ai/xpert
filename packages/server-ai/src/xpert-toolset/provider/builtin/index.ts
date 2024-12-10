import { Type } from '@nestjs/common'
import { BingToolset } from "./bing/bing";
import { DuckDuckGoToolset } from "./duckduckgo/duckduckgo";
import { TavilyToolset } from "./tavily/tavily";
import { ToolsetFolderPath } from '../../types';
import { IXpertToolset } from '@metad/contracts';
import { TBuiltinToolsetParams } from './builtin-toolset';
import { ToolProviderNotFoundError } from '../../errors';
import { DingTalkToolset } from './dingtalk/dingtalk';
import { FeishuToolset } from './feishu/feishu';
import { SlackToolset } from './slack/slack';
import { GithubToolset } from './github/github';
import { SmtpToolset } from './email/email';
import { DiscordToolset } from './discord/discord';
import { SerpAPIToolset } from './serpapi/serpapi';

export * from './command'
export * from './builtin-tool'
export * from './builtin-toolset'

export const BUILTIN_TOOLSET_REPOSITORY: {
	baseUrl: string;
	providers: Array<Type<any> & {provider: string}>
}[] = [
	{
		baseUrl: ToolsetFolderPath,
		providers: [
			TavilyToolset,
            DuckDuckGoToolset,
            BingToolset,
			DingTalkToolset,
			FeishuToolset,
			SlackToolset,
			GithubToolset,
			SmtpToolset,
			DiscordToolset,
			SerpAPIToolset
        ]
	}
]

export function getBuiltinToolsetBaseUrl(name: string) {
	return BUILTIN_TOOLSET_REPOSITORY.find((item) => item.providers.some((_) => _.provider === name))?.baseUrl
}

export function createBuiltinToolset(provider: string, toolset?: IXpertToolset, params?: TBuiltinToolsetParams) {
	let providerTypeClass = null
	BUILTIN_TOOLSET_REPOSITORY.find((item) => {
		providerTypeClass = item.providers.find((_) => _.provider === provider)
		return !!providerTypeClass
	})

    if (providerTypeClass) {
        return new providerTypeClass(toolset, params)
    }
    throw new ToolProviderNotFoundError(`Builtin tool provider '${provider}' not found!`)
}