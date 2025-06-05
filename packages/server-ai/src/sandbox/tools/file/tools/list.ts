import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { LangGraphRunnableConfig } from '@langchain/langgraph'
import { Logger } from '@nestjs/common'
import * as _axios from 'axios'
import z from 'zod'
import { SandboxLoadCommand } from '../../../../../sandbox/commands'
import { SandboxBaseTool } from '../../sandbox-tool'
import { FileToolset } from '../file'
import { FileToolEnum } from '../types'
const axios = _axios.default

export class FileListTool extends SandboxBaseTool {
	readonly #logger = new Logger(FileListTool.name)

	static lc_name(): string {
		return FileToolEnum.FILE_LIST
	}
	name = FileToolEnum.FILE_LIST
	description = 'A tool can list files in current dir'

	schema = z.object({})

	constructor(protected toolset: FileToolset) {
		super(toolset)
	}

	async _call(parameters: object, callbacks: CallbackManagerForToolRun, config: LangGraphRunnableConfig & { toolCall }) {
		const { signal, configurable } = config ?? {}

		const {sandboxUrl} = await this.toolset.commandBus.execute<SandboxLoadCommand, {sandboxUrl: string}>(new SandboxLoadCommand())

		const requestData = {
			...parameters,
			thread_id: configurable?.thread_id
		}

		try {
			const result = await axios.post(`${sandboxUrl}/file/list/`, requestData, { signal })

			return JSON.stringify(result.data)
		} catch (error) {
			throw error.response?.data?.detail || error.response?.data || error
		}
	}
}
