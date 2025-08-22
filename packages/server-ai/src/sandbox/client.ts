import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import {
	ChatMessageEventTypeEnum,
	ChatMessageStepCategory,
	TChatMessageStep,
	TProgramToolMessage,
	TToolCall
} from '@metad/contracts'
import { getPythonErrorMessage, shortuuid, urlJoin } from '@metad/server-common'
import { environment } from '@metad/server-config'
import { DeployWebappCommand, RequestContext } from '@metad/server-core'
import { CommandBus } from '@nestjs/cqrs'
import axios from 'axios'
import { EventSource } from 'eventsource'
import { ServerResponse } from 'http'
import { t } from 'i18next'
import { Observable } from 'rxjs'
import { sandboxVolumeUrl } from '../shared'

/**
 * Base parameters for sandbox operations.
 */
export type TSandboxBaseParams = {
	workspace_id: string
	/**
	 * @deprecated use `workspace_id`
	 */
	thread_id?: string
}

export type TListFilesReq = TSandboxBaseParams & {
	path?: string
	depth?: number
	limit?: number
}
export type TListFilesResponse = {
	files: {
		name: string
		extension: string
		size: number
		created_date: string
	}[]
}

export type TFileBaseReq = TSandboxBaseParams & {
	file_path: string
}

export type TCreateFileReq = TFileBaseReq & {
	file_contents?: string
	file_description?: string
	permissions?: string
}

export type TReadFileReq = TFileBaseReq & {
	line_from?: number
	line_to?: number
}

export type TCreateFileResp = {
	message: string
}

export class SandboxFileSystem {
	constructor(protected sandboxUrl: string) {}

	async doRequest(path: string, requestData: any, options: { signal: AbortSignal }) {
		if (environment.pro) {
			const sandboxUrl = this.sandboxUrl
			try {
				const result = await axios.post(`${sandboxUrl}/file/` + path, requestData, options)
				return result.data
			} catch (error) {
				throw new Error(getPythonErrorMessage(error))
			}
		}

		return requestData
	}

	async createFile(body: TCreateFileReq, options: { signal: AbortSignal }): Promise<TCreateFileResp> {
		return this.doRequest('create', body, options)
	}

	async listFiles(body: TListFilesReq, options: { signal: AbortSignal }): Promise<TListFilesResponse> {
		return this.doRequest('list', body, options)
	}

	async readFile(body: TReadFileReq, options?: { signal: AbortSignal }): Promise<string> {
		const response = await this.doRequest('read', body, { signal: options?.signal })
		return response.content
	}

	async deleteFile(body: TFileBaseReq, options?: { signal: AbortSignal }) {
		await this.doRequest('delete', body, { signal: options?.signal })
	}

	async streamFile(path: string, res: ServerResponse, options?: { signal: AbortSignal }) {
		const sandboxUrl = this.sandboxUrl
		const response = await axios.get(`${sandboxUrl}/file/stream/${path}`, {
			responseType: 'stream',
			signal: options?.signal
		})

		// Determine the media type using a mapping object
		const mediaTypeMapping: { [key: string]: string } = {
			'.txt': 'text/plain; charset=utf-8',
			'.json': 'application/json; charset=utf-8',
			'.html': 'text/html; charset=utf-8',
			'.py': 'text/plain; charset=utf-8',
			'.md': 'text/markdown; charset=utf-8',
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.png': 'image/png',
			'.pdf': 'application/pdf'
		}

		// Extract the file extension
		const fileExtension = Object.keys(mediaTypeMapping).find((ext) => path.endsWith(ext))
		const mediaType = fileExtension ? mediaTypeMapping[fileExtension] : 'text/plain; charset=utf-8'

		// Set the Content-Type header
		res.setHeader('Content-Type', mediaType)
		response.data.pipe(res)
	}
}

export type TProjectBaseParams = TSandboxBaseParams & {
	project_name: string
}

export type TProjectInitParams = TProjectBaseParams & {
	type?: string
}

export type TProjectDeployParams = TProjectBaseParams & {
	base_url: string
	deploy_path?: string
}

export type TProjectCodeParams = TProjectBaseParams & {
	filename: string
	type?: string
	content: string
}

const completionCondition = (data) => {
			return data.includes('<done>')
		}
	const errorCondition = (data) => {
			return data.includes('<error>')
		}
export class ProjectClient {
	get sandboxUrl() {
		return this.params.sandboxUrl
	}
	constructor(
		protected params: {
			commandBus: CommandBus
			sandboxUrl: string
		}
	) {}

	async doRequest(
		path: string,
		requestData: any,
		options: { signal: AbortSignal; responseType?: 'blob' | 'stream' }
	) {
		if (environment.pro) {
			const sandboxUrl = this.sandboxUrl
			try {
				return await axios.post(`${sandboxUrl}/project/` + path, requestData, options)
			} catch (error) {
				console.error(error.response)
				throw new Error(getPythonErrorMessage(error))
			}
		}

		return requestData
	}

	async init(body: TProjectInitParams, options: { signal: AbortSignal }): Promise<string> {
		const response = await this.doRequest('init', body, options)
		return response.data
	}

	async code(body: TProjectCodeParams, options: { signal: AbortSignal }): Promise<string> {
		const response = await this.doRequest('code', body, options)
		return JSON.stringify(response.data, null, 2)
	}

	async build(body: TProjectDeployParams, options: { signal: AbortSignal }): Promise<string> {
		const command = `npm install && npm run build`
		return new Promise((resolve, reject) => {
				const stepId = shortuuid()
				const createdDate = new Date()
				let result = ''
				const es = new EventSource(this.sandboxUrl + '/project/build/', {
					fetch: (input, init) =>
						fetch(input, {
							...init,
							method: 'POST',
							headers: {
								...init.headers,
								'Content-Type': 'application/json'
							},
							body: JSON.stringify(body),
							signal: options.signal
						})
				})

				es.addEventListener('message', (event) => {
					if (errorCondition(event.data)) {
						dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
							id: stepId,
							category: 'Computer',
							type: ChatMessageStepCategory.Program,
							end_date: new Date(),
							status: 'fail',
							error: event.data,
							data: {
								code: command,
								output: result
							},
						} as TChatMessageStep<TProgramToolMessage>).catch((err) => {
							console.error(err)
						})
						reject(`Build failed:\n${result}`)
					} else if (completionCondition(event.data)) {
						dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
							id: stepId,
							category: 'Computer',
							type: ChatMessageStepCategory.Program,
							end_date: new Date(),
							status: 'success',
							data: {
								code: command,
								output: result
							},
						} as TChatMessageStep<TProgramToolMessage>).catch((err) => {
							console.error(err)
						})
						resolve(result) // Resolve with the complete message
						es.close() // Close the connection
						return
					} else if (event.data != null) {
						try {
							if (result) {
								result += '\n'
							}
							result += event.data ?? ''

							// Update tool message
							dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
								id: stepId,
								category: 'Computer',
								type: ChatMessageStepCategory.Program,
								toolset: 'code-project',
								tool: 'build-deploy',
								title: t('server-ai:Tools.CodeProject.Building'),
								message: `npm run build`,
								data: {
									code: command,
									output: result
								},
								created_date: createdDate,
								status: 'running'
							} as TChatMessageStep<TProgramToolMessage>).catch((err) => {
								console.error(err)
							})
						} catch (err) {
							throw new Error(`Convert build call result error`)
						}
					}
				})

				es.addEventListener('error', (err) => {
					console.error(err)
					if (err.code === 401 || err.code === 403) {
						console.log('not authorized')
					}
					es.close()
					reject(err)
				})
			})
	}

	async deploy(body: TProjectDeployParams, options: { signal: AbortSignal }): Promise<string> {
		const response = await this.doRequest('deploy', body, { ...options, responseType: 'stream' })
		return this.params.commandBus.execute(new DeployWebappCommand(response.data, body.deploy_path))
	}
}

export class PythonClient {
	get sandboxUrl() {
		return this.params.sandboxUrl
	}
	constructor(
		protected params: TSandboxParams
	) {}

	async exec(body: { code: string }, options: { signal: AbortSignal }): Promise<string> {
		if (environment.pro) {
			const sandboxUrl = this.sandboxUrl
			try {
				const { data: result } = await axios.post(`${sandboxUrl}/python/exec/`, body, { signal: options.signal })
				return JSON.stringify(result.observation, null, 2)
			} catch (error) {
				throw new Error(getPythonErrorMessage(error))
			}
		}

		return body.code
	}
}

export class BaseToolClient {
	get sandboxUrl() {
		return this.params.sandboxUrl
	}
	constructor(
		protected params: {
			commandBus: CommandBus
			sandboxUrl: string
		}
	) {}

	async doRequest(path: string, requestData: any, options: { signal: AbortSignal }) {
		if (environment.pro) {
			const sandboxUrl = this.sandboxUrl
			try {
				const result = await axios.post(`${sandboxUrl}/` + path, requestData, options)
				return result.data
			} catch (error) {
				throw new Error(getPythonErrorMessage(error))
			}
		}

		return requestData
	}
}

export type TShellExecReq = TSandboxBaseParams & {
	dir?: string
	command: string
}

export class ShellClient extends BaseToolClient {

	stream(body: TShellExecReq, options?: { signal?: AbortSignal }) {
		return new Observable((subscriber) => {
			const abortController = new AbortController()
			let result = ''
			const es = new EventSource(this.sandboxUrl + '/shell/exec/', {
				fetch: (input, init) =>
					fetch(input, {
						...init,
						method: 'POST',
						headers: {
							...init.headers,
							'Content-Type': 'application/json'
						},
						body: JSON.stringify(body),
						signal: abortController.signal
					})
			})

			es.addEventListener('message', (event) => {
				if (errorCondition(event.data)) {
					subscriber.error(result)
					es.close()
					return
				} else if (completionCondition(event.data)) {
					subscriber.complete()
					es.close() // Close the connection
					return
				} else if (event.data != null) {
					try {
						if (result) {
							result += '\n'
						}
						result += event.data ?? ''
						// Update
						subscriber.next(event.data ?? '')
					} catch (err) {
						throw new Error(`Convert bash call result error`)
					}
				}
			})

			es.addEventListener('error', (err) => {
				console.error(err)
				if (err.code === 401 || err.code === 403) {
					console.log('not authorized')
				}
				es.close()
				subscriber.error(err)
			})

			return () => {
				abortController.abort()
			}
		})
	}

	/**
	 * @deprecated should use stream
	 */
	async exec(body: TShellExecReq, options: { signal: AbortSignal; toolCall: TToolCall }) {
		if (environment.pro) {
			return new Promise((resolve, reject) => {
				const stepId = options.toolCall?.id || shortuuid()
				let result = ''
				const es = new EventSource(this.sandboxUrl + '/shell/exec/', {
					fetch: (input, init) =>
						fetch(input, {
							...init,
							method: 'POST',
							headers: {
								...init.headers,
								'Content-Type': 'application/json'
							},
							body: JSON.stringify(body),
							signal: options.signal
						})
				})

				es.addEventListener('message', (event) => {
					if (errorCondition(event.data)) {
						this.dispatchStepEvent(body.command, result, stepId, event.data)
						reject(result)
						es.close()
						return
					} else if (completionCondition(event.data)) {
						this.dispatchStepEvent(body.command, result, stepId)
						resolve(result) // Resolve with the complete message
						es.close() // Close the connection
						return
					} else if (event.data != null) {
						try {
							if (result) {
								result += '\n'
							}
							result += event.data ?? ''

							// Update tool message
							this.dispatchStepEvent(body.command, result, stepId)
						} catch (err) {
							throw new Error(`Convert bash call result error`)
						}
					}
				})

				es.addEventListener('error', (err) => {
					console.error(err)
					if (err.code === 401 || err.code === 403) {
						console.log('not authorized')
					}
					es.close()
					reject(err)
				})
			})
		}

		return await this.doRequest('bash/exec/', body, { signal: options.signal })
	}

	async dispatchStepEvent(command: string, output: string, stepId: string, error?: string) {
		dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
			{
				id: stepId,
				category: 'Computer',
				type: ChatMessageStepCategory.Program,
				toolset: 'Bash',
				tool: 'execute',
				title: t('server-ai:Tools.Bash.ExecuteBashCommand'),
				message: command,
				data: {
					code: command,
					output: output
				},
				error
			} as TChatMessageStep<TProgramToolMessage>
		).catch((err) => {
					console.error(err)
				})
	}
}

export type TSandboxParams = {
	commandBus: CommandBus
	sandboxUrl: string
	volume?: string
	tenantId?: string
	projectId?: string
	userId: string
	conversationId: string
}

export class Sandbox {
	volume = ''
	fs = new SandboxFileSystem(this.sandboxUrl)
	project = new ProjectClient(this.params)
	python = new PythonClient(this.params)
	shell = new ShellClient(this.params)
	browser = new BrowserClient(this.params)
	git  = new GitClient(this.params)

	static sandboxVolume(projectId: string, userId: string) {
		return projectId ? `/projects/${projectId}` : `/users/${userId}`
	}

	static sandboxFileUrl(volume: string, workspaceId: string, file: string) {
    	return urlJoin(sandboxVolumeUrl(volume, workspaceId), file) + `?tenant=${RequestContext.currentTenantId()}`;
	}

	get sandboxUrl() {
		return this.params.sandboxUrl
	}
	constructor(protected params: TSandboxParams) {
		this.volume = this.params.volume || ''
	}

	async ensureSandbox() {
		//
	}

	async doRequest(path: string, requestData: any, options: { signal: AbortSignal }) {
		if (environment.pro) {
			const sandboxUrl = this.sandboxUrl
			try {
				const result = await axios.post(`${sandboxUrl}/` + path, requestData, options)
				return JSON.stringify(result.data)
			} catch (error) {
				throw new Error(getPythonErrorMessage(error))
			}
		}

		return requestData
	}
}


export type TBrowserActionResult = {
	success?: boolean
	message?: string
	error?: string

	// Extended state information
	url?: string
	title?: string
	elements?: string // Formatted string of clickable elements
	screenshot_base64?: string
	pixels_above?: number
	pixels_below?: number
	content?: string
	ocr_text?: string // Added field for OCR text

	// Additional metadata
	element_count?: number // Number of interactive elements found
	interactive_elements?: Array<Record<string, any>> // Simplified list of interactive elements
	viewport_width?: number
	viewport_height?: number
}

export class BrowserClient {
	get sandboxUrl() {
		return this.params.sandboxUrl
	}
	constructor(
		protected params: {
			commandBus: CommandBus
			sandboxUrl: string
		}
	) {}

	/**
	 * Execute a browser automation action through the API
	 * 
	 * @param endpoint The API endpoint to call
	 * @param params Parameters to send. Defaults to null.
	 * @param method HTTP method to use. Defaults to "POST".
	 */
	async executeAction(endpoint: string, params: Record<string, any> | string = null, options: { method?: 'POST'; signal: AbortSignal; responseType?: 'blob' | 'stream' }): Promise<TBrowserActionResult> {
		if (environment.pro) {
			const sandboxUrl = this.sandboxUrl
			try {
				const response = await axios.post(`${sandboxUrl}/browser/` + endpoint, params, options)
				const data = response.data as TBrowserActionResult
				if (data.error) {
					throw new Error(data.error)
				}
				return data
			} catch (error) {
				console.error(error.response)
				throw new Error(getPythonErrorMessage(error))
			}
		}

		return null
	}
}

export class GitClient {
	get sandboxUrl() {
		return this.params.sandboxUrl
	}
	constructor(
		protected params: TSandboxParams
	) {}

	async clone(url: string, path: string, branch: string) {
        return ''
    }
	async status(repoPath: string) {
		return ''
	}
	async branches(repoPath: string) {
		return ''
	}
	async createBranch(repoPath: string, branchName: string) {
		return ''
	}
	async checkoutBranch(repoPath: string, branchName: string) {
		return ''
	}
	async deleteBranch(repoPath: string, branchName: string) {
		return ''
	}
	async add(repoPath: string, files: string[]) {
		return ''
	}
	async commit(repoPath: string, message: string) {
		return ''
	}
	async push(repoPath: string) {
		return ''
	}
	async pull(repoPath: string) {
		return ''
	}
}