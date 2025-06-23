import { urlJoin } from '@metad/server-common'
import fsPromises from 'fs/promises'
import path from 'path'
import { listFiles } from '../shared'

export class VolumeClient {
	tenantId: string
	userId: string
	projectId?: string

	private volumePath: string
	private baseUrl: string

	constructor(params: { tenantId: string; userId: string; projectId?: string }) {
		this.tenantId = params.tenantId
		this.userId = params.userId
		this.projectId = params.projectId
	}

	async putFile(folder = '', file: Express.Multer.File): Promise<string> {
		const targetFolder = path.join(this.volumePath, folder)
		const filePath = path.join(targetFolder, file.originalname)
		await fsPromises.mkdir(targetFolder, { recursive: true })
		await fsPromises.writeFile(filePath, file.buffer)
		return urlJoin(this.baseUrl, folder, file.originalname)
	}

	async deleteFile(filePath: string): Promise<void> {
		const fullPath = path.join(this.volumePath, filePath)
		try {
			await fsPromises.unlink(fullPath)
		} catch (error) {
			if (error.code !== 'ENOENT') {
				throw error // Re-throw if it's not a "file not found" error
			}
		}
	}

	async list(params: { path?: string; deepth?: number }) {
		const { path: folder, deepth } = params
		return await listFiles(folder || '/', deepth ?? 1, 0, { root: this.volumePath, baseUrl: this.baseUrl })
	}
}
