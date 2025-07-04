import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { getCurrentTaskInput, LangGraphRunnableConfig } from '@langchain/langgraph'
import {
	ChatMessageEventTypeEnum,
	ChatMessageStepCategory,
	ChatMessageTypeEnum,
	LanguagesEnum,
	mapTranslationLanguage,
	STATE_VARIABLE_SYS,
	TChatMessageStep,
	TMessageComponent
} from '@metad/contracts'
import { shortuuid } from '@metad/server-common'
import { environment } from '@metad/server-config'
import { Logger } from '@nestjs/common'
import * as _axios from 'axios'
import z from 'zod'
import { CodeProjectToolset } from '../code-project'
import { CodeProjectToolEnum } from '../types'
import { SandboxBaseTool } from '../../sandbox-tool'
import { AgentStateAnnotation } from '../../../../shared'
const axios = _axios.default

export type TDeployToolParameters = {
	filename: string
	type: 'jsx'
	content?: string
	language?: string
}

export class DeployTool extends SandboxBaseTool {
	readonly #logger = new Logger(DeployTool.name)

	static lc_name(): string {
		return CodeProjectToolEnum.Deploy
	}
	name = CodeProjectToolEnum.Deploy
	description = 'A tool can deploy the project to server.'

	schema = z.object({
		filename: z.string().describe(`The name of the file to be deployed`),
		type: z.enum(['jsx']).optional().nullable().describe('Which type of code file'),
		content: z.string().optional().nullable().describe('The content of code file, can be empty if the file has already been created'),
		language: z.string().optional().nullable()
	})

	constructor(protected toolset: CodeProjectToolset) {
		super(toolset)
	}

	async _call(
		parameters: TDeployToolParameters,
		callbacks: CallbackManagerForToolRun,
		config: LangGraphRunnableConfig & { toolCall }
	) {
		const { signal, configurable } = config ?? {}
		const currentState = getCurrentTaskInput<typeof AgentStateAnnotation.State>()
		const lang = currentState[STATE_VARIABLE_SYS]?.language as LanguagesEnum;

		const sandboxUrl = this.toolset.sandboxUrl
		const baseUrl = `${environment.baseUrl}/api/sandbox/web/${configurable?.thread_id}/`
		const requestData = {
			filename: parameters.filename,
			type: parameters.type,
			content: parameters.content,
			thread_id: configurable?.thread_id
		}

		try {
			const result = await axios.post(`${sandboxUrl}/project/deploy/`, requestData, { signal })
			const files = result.data.files.map((file) => ({ ...file, url: baseUrl + file.name, filePath: file.name }))
			const i18n = await this.toolset.translate('toolset.CodeProject', { lang: mapTranslationLanguage(lang) })
			// Tool message event

			return JSON.stringify(files)
		} catch (error) {
			console.error(error)
			throw new Error(error.response?.data?.detail || error.response?.data || error)
		}
	}
}
