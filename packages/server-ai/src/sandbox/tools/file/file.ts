import { StructuredToolInterface } from '@langchain/core/tools'
import { isEnableTool, IXpertToolset } from '@metad/contracts'
import { BaseSandboxToolset, TSandboxToolsetParams } from '../sandbox-toolset'
import { buildCreateFileTool } from './tools/create_file'
import { FileToolEnum } from './types'
import { buildListFilesTool } from './tools/list_files'
import { buildReadFileTool } from './tools/read_file'
import { buildStrReplaceTool } from './tools/str_replace'
import { buildFullFileRewriteTool } from './tools/full_file_rewrite'
import { buildDeleteFileTool } from './tools/delete_file'

export class FileToolset extends BaseSandboxToolset<StructuredToolInterface> {
	static provider = 'file'

	constructor(
		protected toolset?: IXpertToolset,
		params?: TSandboxToolsetParams
	) {
		super(FileToolset.provider, params, toolset)
	}

	async initTools() {
		await this._ensureSandbox()
		const allEnabled = !this.toolset?.tools?.length
		this.tools = []

		if (allEnabled || this.isEnabled(FileToolEnum.CREATE_FILE)) {
			this.tools.push(buildCreateFileTool(this))
		}
		if (allEnabled || this.isEnabled(FileToolEnum.LIST_FILES)) {
			this.tools.push(buildListFilesTool(this))
		}
		if (allEnabled || this.isEnabled(FileToolEnum.READ_FILE)) {
			this.tools.push(buildReadFileTool(this))
		}
		if (allEnabled || this.isEnabled(FileToolEnum.STR_REPLACE)) {
			this.tools.push(buildStrReplaceTool(this))
		}
		if (allEnabled || this.isEnabled(FileToolEnum.FULL_FILE_REWRITE)) {
			this.tools.push(buildFullFileRewriteTool(this))
		}
		if (allEnabled || this.isEnabled(FileToolEnum.DELETE_FILE)) {
			this.tools.push(buildDeleteFileTool(this))
		}
		return this.tools
	}

	isEnabled(name: string) {
		return this.toolset?.tools?.some((_) => isEnableTool(_, this.toolset) && name === _.name)
	}
}
