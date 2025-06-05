import { environment } from '@metad/server-config'
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

export class Sandbox {
	fs = new FileSystem(this.sandboxUrl)

	constructor(protected sandboxUrl: string) {}

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

export class MockSandbox extends Sandbox {
	fs = new MockFileSystem(this.sandboxUrl)

	async doRequest(path: string, requestData: any, options: { signal: AbortSignal }) {
		return
	}
}