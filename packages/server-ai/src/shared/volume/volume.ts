import { urlJoin } from '@metad/server-common'
import { environment } from '@metad/server-config'
import fsPromises from 'fs/promises'
import path, { join } from 'path'
import { getWorkspace, listFiles, sandboxVolume, sandboxVolumeUrl } from '../utils'

export class VolumeClient {
	tenantId: string
	userId: string
	projectId?: string

	protected volumePath: string
	protected baseUrl: string

	static getSandboxVolumeRoot(tenantId: string) {
		const homeDir = process.env.HOME || process.env.USERPROFILE
		if (environment.envName === 'dev') {
			// Host is sandbox
			return path.join(homeDir, 'data') // `~/data` is the default directory in sandbox
		} else {
			// Production container binds host volume
			return `/sandbox/${tenantId}`
		}
	}

	// static getSandboxVolumePath(tenantId: string, userId: string, projectId: string): string {
	// 	const root = VolumeClient.getSandboxVolumeRoot(tenantId)
	// 	if (environment.envName === 'dev') {
	// 		return root
	// 	}
	// 	return path.join(root, sandboxVolume(projectId, userId))
	// }

	static getWorkspaceRoot(tenantId: string, projectId: string, userId: string) {
		if (environment.env.IS_DOCKER === 'true') {
			return path.join(`/sandbox/${tenantId}`, sandboxVolume(projectId, userId))
		} else {
			return path.join(process.env.HOME || process.env.USERPROFILE, 'data')
		}
	}

	static _getWorkspaceRoot(tenantId: string, type: 'projects' | 'users' | 'knowledges', id: string) {
		if (environment.env.IS_DOCKER === 'true') {
			return path.join(`/sandbox/${tenantId}`, `/${type}/${id}`)
		} else {
			return path.join(process.env.HOME || process.env.USERPROFILE, 'data')
		}
	}

	static async getWorkspacePath(tenantId: string, projectId: string, userId: string, conversationId?: string): Promise<string> {
		const dist = path.join(VolumeClient.getWorkspaceRoot(tenantId, projectId, userId), getWorkspace(projectId, conversationId) || '')
		await fsPromises.mkdir(dist, { recursive: true })
		return dist
	}

	static getWorkspaceUrl(projectId: string, userId: string, conversationId?: string) {
		return sandboxVolumeUrl(sandboxVolume(projectId, userId), getWorkspace(projectId, conversationId))
	}

	constructor(params: { tenantId: string; catalog: 'projects' | 'users' | 'knowledges'; userId: string; knowledgeId?: string; projectId?: string }) {
		this.tenantId = params.tenantId
		this.userId = params.userId
		this.projectId = params.projectId
		
		const subpath = params.catalog === 'knowledges' ? `/${params.catalog}/${params.knowledgeId}` :
			  params.projectId ? `/projects/${params.projectId}` :
			    `/users/${params.userId}`
		// this.volumePath = VolumeClient.getSandboxVolumePath(this.tenantId, this.userId, this.projectId)
		this.baseUrl = sandboxVolumeUrl(subpath)

		const root = VolumeClient.getSandboxVolumeRoot(params.tenantId)
		if (environment.envName === 'dev') {
			this.volumePath = root
		}
		this.volumePath = path.join(root, subpath)
	}

	async putFile(folder = '', file: {originalname: string; buffer: Buffer;} /*Express.Multer.File*/): Promise<string> {
		const targetFolder = path.join(this.volumePath, folder)
		const filePath = path.join(targetFolder, file.originalname)
		await fsPromises.mkdir(targetFolder, { recursive: true })
		await fsPromises.writeFile(filePath, file.buffer as unknown as string)
		return urlJoin(this.baseUrl, folder, file.originalname)
	}

	async readFile(filePath: string) {
		const fullPath = path.join(this.volumePath, filePath)
		return await fsPromises.readFile(fullPath, 'utf-8')
	}

	async deleteFile(filePath: string): Promise<void> {
		const fullPath = path.join(this.volumePath, filePath)
		try {
			const stat = await fsPromises.stat(fullPath)
			if (stat.isDirectory()) {
				await fsPromises.rm(fullPath, { recursive: true, force: true })
			} else {
				await fsPromises.unlink(fullPath)
			}
		} catch (error: any) {
			if (error.code !== 'ENOENT') {
				throw error // Re-throw if it's not a "file not found" error
			}
		}
	}

	async list(params: { path?: string; deepth?: number }) {
		const { path: folder, deepth } = params
		return await listFiles(folder || '/', deepth ?? 1, 0, { root: this.volumePath, baseUrl: this.baseUrl })
	}

	getVolumePath(path: string) {
		return join(this.volumePath, path)
	}
	getPublicUrl(filePath: string) {
		return urlJoin(this.baseUrl, filePath)
	}
}
