import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { getPythonErrorMessage, shortuuid } from '@metad/server-common'
import { environment } from '@metad/server-config'
import { DeployWebappCommand } from '@metad/server-core'
import { CommandBus } from '@nestjs/cqrs'
import { EventSource } from 'eventsource'
import axios from 'axios'
import {t} from 'i18next'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory, ChatMessageStepType, TChatMessageStep, TProgramToolMessage } from '@metad/contracts'
import { ToolInvokeError } from '../xpert-toolset'

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

export class FileSystem {
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

	async createFile(body: TCreateFileReq, options: { signal: AbortSignal }): Promise<void> {
		return this.doRequest('create', body, options)
	}

	async listFiles(body: TSandboxBaseParams, options: { signal: AbortSignal }): Promise<TListFilesResponse> {
		return this.doRequest('list', body, options)
	}
}

export type TProjectDeployParams = TSandboxBaseParams & {
	base_url: string
	type: string
}

export type TProjectCodeParams = TSandboxBaseParams & {
	filename: string
	type: string
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
				console.log(error)
				throw new Error(error.response?.data?.detail || error.response?.data || error)
			}
		}

		return requestData
	}

	async code(body: TProjectCodeParams, options: { signal: AbortSignal }): Promise<string> {
		const response = await this.doRequest('code', body, options)
		return JSON.stringify(response.data, null, 2)
	}

	async deploy(body: TProjectDeployParams, options: { signal: AbortSignal }): Promise<string> {
		const response = await this.doRequest('deploy', body, { ...options, responseType: 'stream' })
		return this.params.commandBus.execute(new DeployWebappCommand(response.data, body.thread_id))
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
								title: t('server-ai:toolset.Bash.ExecuteBashCommand'),
								message: body.command,
								data: {
									code: body.command,
									output: result,
								}
							} as TChatMessageStep<TProgramToolMessage>).catch((err) => {
								console.error(err)
							})
						} catch (err) {
							throw new ToolInvokeError(`转换浏览器调用结果错误`)
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
	fs = new FileSystem(this.sandboxUrl)
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

export class MockFileSystem extends FileSystem {
	async doRequest(path: string, requestData: any, options: { signal: AbortSignal }) {
		return
	}

	async createFile(body: any, options: { signal: AbortSignal }): Promise<void> {
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
