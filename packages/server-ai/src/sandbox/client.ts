import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import {
	ChatMessageEventTypeEnum,
	ChatMessageStepCategory,
	ChatMessageStepType,
	TChatMessageStep,
	TProgramToolMessage
} from '@metad/contracts'
import { getPythonErrorMessage, shortuuid } from '@metad/server-common'
import { environment } from '@metad/server-config'
import { DeployWebappCommand } from '@metad/server-core'
import { CommandBus } from '@nestjs/cqrs'
import axios from 'axios'
import { EventSource } from 'eventsource'
import { ServerResponse } from 'http'
import { t } from 'i18next'
import { ToolInvokeError } from '../xpert-toolset'

/**
 * Base parameters for sandbox operations.
 */
export type TSandboxBaseParams = {
	workspace_id: string
	/**
	 * @deprecated use `workspace_id`
	 */
	thread_id: string
}

export type TListFilesResponse = {
	files: {
		name: string
		extension: string
		size: number
		created_date: string
	}[]
}

export type TCreateFileReq = TSandboxBaseParams & {
	//
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

	async listFiles(body: TSandboxBaseParams, options: { signal: AbortSignal }): Promise<TListFilesResponse> {
		return this.doRequest('list', body, options)
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

export type TProjectDeployParams = TSandboxBaseParams & {
	base_url: string
	type: string
}

export type TProjectCodeParams = TSandboxBaseParams & {
	filename: string
	type?: string
	content: string
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

	async code(body: TProjectCodeParams, options: { signal: AbortSignal }): Promise<string> {
		const response = await this.doRequest('code', body, options)
		return JSON.stringify(response.data, null, 2)
	}

	async build(body: TProjectDeployParams, options: { signal: AbortSignal }): Promise<string> {
		// const response = await this.doRequest('build', body, { signal: options.signal })
		const completionCondition = (data) => {
				return data.includes('<done>')
			}

		return new Promise((resolve, reject) => {
				const stepId = shortuuid()
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
					console.log(event.data)

					if (completionCondition(event.data)) {
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
								type: ChatMessageStepType.ComputerUse,
								category: ChatMessageStepCategory.Program,
								toolset: 'code-project',
								tool: 'build-deploy',
								title: t('server-ai:Tools.CodeProject.Building'),
								message: t('server-ai:Tools.CodeProject.Building'),
								data: {
									code: `npm install && npm run build`,
									output: result
								}
							} as TChatMessageStep<TProgramToolMessage>).catch((err) => {
								console.error(err)
							})
						} catch (err) {
							throw new ToolInvokeError(`Convert build call result error`)
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
		return this.params.commandBus.execute(new DeployWebappCommand(response.data, body.workspace_id))
	}
}

export class PythonClient {
	get sandboxUrl() {
		return this.params.sandboxUrl
	}
	constructor(
		protected params: {
			commandBus: CommandBus
			sandboxUrl: string
		}
	) {}
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

export class BashClient extends BaseToolClient {
	async exec(body, options: { signal: AbortSignal }) {
		if (environment.pro) {
			const completionCondition = (data) => {
				return data.includes('<done>')
			}
			return new Promise((resolve, reject) => {
				const stepId = shortuuid()
				let result = ''
				const es = new EventSource(this.sandboxUrl + '/bash/exec/', {
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
					console.log(event.data)

					if (completionCondition(event.data)) {
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
								type: ChatMessageStepType.ComputerUse,
								category: ChatMessageStepCategory.Program,
								toolset: 'Bash',
								tool: 'execute',
								title: t('server-ai:Tools.Bash.ExecuteBashCommand'),
								message: body.command,
								data: {
									code: body.command,
									output: result
								}
							} as TChatMessageStep<TProgramToolMessage>).catch((err) => {
								console.error(err)
							})
						} catch (err) {
							throw new ToolInvokeError(`Convert bash call result error`)
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
}

export class Sandbox {
	fs = new SandboxFileSystem(this.sandboxUrl)
	project = new ProjectClient(this.params)
	python = new PythonClient(this.params)
	bash = new BashClient(this.params)

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
				return JSON.stringify(result.data)
			} catch (error) {
				throw new Error(getPythonErrorMessage(error))
			}
		}

		return requestData
	}
}

export class MockFileSystem extends SandboxFileSystem {
	async doRequest(path: string, requestData: any, options: { signal: AbortSignal }): Promise<any> {
		return
	}

	async createFile(body: any, options: { signal: AbortSignal }): Promise<TCreateFileResp> {
		return this.doRequest('create', body, options)
	}
}

export class MockProjectClient extends ProjectClient {
	async doRequest(path: string, requestData: any, options: { signal: AbortSignal }) {
		return
	}

	async deploy(body: TProjectDeployParams, options: { signal: AbortSignal }): Promise<string> {
		return ''
	}
}

export class MockPythonClient extends PythonClient {
	async doRequest(path: string, requestData: any, options: { signal: AbortSignal }) {
		return
	}

	async deploy(body: TProjectDeployParams, options: { signal: AbortSignal }): Promise<string> {
		return ''
	}
}

export class MockSandbox extends Sandbox {
	fs = new MockFileSystem(this.sandboxUrl)
	project = new MockProjectClient(this.params)
	python = new MockPythonClient(this.params)

	async doRequest(path: string, requestData: any, options: { signal: AbortSignal }) {
		return
	}
}
