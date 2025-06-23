import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { LangGraphRunnableConfig } from '@langchain/langgraph'
import { Logger } from '@nestjs/common'
import z from 'zod'
import { SandboxBaseTool } from '../../sandbox-tool'
import { FileToolset } from '../file'
import { FileToolEnum } from '../types'

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

		try {
			//
		} catch (error) {
			throw error.response?.data?.detail || error.response?.data || error
		}
	}
}
