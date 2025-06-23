import { BUILTIN_TOOLSET_REPOSITORY } from '../../xpert-toolset'
import { BashToolset } from './bash/bash'
import { BrowserUseToolset } from './browser-use/browser-use'
import { CodeProjectToolset } from './code-project/code-project'
import { FileToolset } from './file/file'
import { PythonToolset } from './python/python'

BUILTIN_TOOLSET_REPOSITORY.splice(0, 0, {
	baseUrl: 'packages/server-ai/src/sandbox/tools/',
	providers: [
		FileToolset,
		PythonToolset,
		CodeProjectToolset,
		BashToolset,
		BrowserUseToolset
	]
})

export { FileToolset, PythonToolset, CodeProjectToolset }
export * from './sandbox-tool'
export * from './sandbox-toolset'
export * from './base-file'