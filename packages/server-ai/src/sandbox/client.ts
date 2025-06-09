import { getPythonErrorMessage } from '@metad/server-common'
import { environment } from '@metad/server-config'
import { DeployWebappCommand } from '@metad/server-core'
import { CommandBus } from '@nestjs/cqrs'
import axios from 'axios'

export class FileSystem {
	constructor(protected sandboxUrl: string) {}

	async doRequest(path: string, requestData: any, options: { signal: AbortSignal }) {
		if (environment.pro) {
			const sandboxUrl = this.sandboxUrl
			try {
				const result = await axios.post(`${sandboxUrl}/file/` + path, requestData, options)
				return JSON.stringify(result.data)
			} catch (error) {
				throw new Error(error.response?.data?.detail || error.response?.data || error)
			}
		}

		return requestData
	}

	async createFile(body: any, options: { signal: AbortSignal }): Promise<void> {
		return this.doRequest('create', body, options)
	}
}

export type TProjectDeployParams = {
	base_url: string
	type: string
	thread_id: string
}

export type TProjectCodeParams = {
	filename: string
	type: string
	content: string
	thread_id: string
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
				throw new Error(error.response?.data?.detail || error.response?.data || error)
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
