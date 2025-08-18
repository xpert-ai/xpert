import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { LangGraphRunnableConfig } from '@langchain/langgraph'
import { Logger } from '@nestjs/common'
import * as _axios from 'axios'
import z from 'zod'
import { FileToolset } from '../file'
import { FileToolEnum } from '../types'
import { SandboxBaseTool } from '../../sandbox-tool'
import { ToolParameterValidationError } from '../../../../xpert-toolset'
import { SandboxLoadCommand } from '../../../commands'
const axios = _axios.default

export type TFileEditToolParameters = {
	command: 'view' | 'create' | 'str_replace' | 'insert' | 'undo_edit'
	path: string
	file_text: string
	// view_range: [number, number]
	old_str: string
	new_str: string
	insert_line: number
}

export class FileEditTool extends SandboxBaseTool {
	readonly #logger = new Logger(FileEditTool.name)

	static lc_name(): string {
		return FileToolEnum.FILE_EDIT
	}
	name = FileToolEnum.FILE_EDIT
	description = 'A tool can edit file in system'

	schema = z.object({
		command: z.enum(['view', 'create', 'str_replace', 'insert', 'undo_edit']).describe('Edit command'),
		path: z
			.string()
			.describe(`(required) The path where the file should be saved, including filename and extension.`),
		file_text: z.string().describe(`(required) The content to save to the file.`),
		// view_range: z.array(z.number()).optional().describe('View range'),
		old_str: z.string().optional().describe('Old string'),
		new_str: z.string().optional().describe('New string'),
		insert_line: z.number().optional().describe('Insert line number')
	})

	constructor(protected toolset: FileToolset) {
		super(toolset)
	}

	async _call(
		parameters: TFileEditToolParameters,
		callbacks: CallbackManagerForToolRun,
		config: LangGraphRunnableConfig & { toolCall }
	) {
		if (!parameters.command) {
			throw new ToolParameterValidationError(`Edit 'command' is empty`)
		}

		const { signal, configurable } = config ?? {}
		const requestData = {
			...parameters,
			thread_id: configurable?.thread_id
		}

		try {
			return ''
		} catch (error) {
			// console.error((<AxiosError>error).toJSON())
			throw new Error(error.response?.data?.detail || error.response?.data || error)
		}
	}
}
