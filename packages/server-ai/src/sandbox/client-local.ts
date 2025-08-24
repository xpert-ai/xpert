import { exec } from 'node:child_process'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import util from 'node:util'
import { VolumeClient } from '../shared'
import { GitClient, ProjectClient, PythonClient, Sandbox, TProjectDeployParams } from './client'
import {
	FilesSystem,
	TCreateFileReq,
	TCreateFileResp,
	TFileBaseReq,
	TListFilesReq,
	TListFilesResponse,
	TReadFileReq,
	TSandboxParams
} from './types'

// Convert exec to return a promise
const execPromise = util.promisify(exec)

export class FileLocalSystem implements FilesSystem {
	constructor(protected params: TSandboxParams) {}

	async createFile(body: TCreateFileReq, options: { signal: AbortSignal }): Promise<TCreateFileResp> {
		const { workspace_id, file_path, file_contents, file_description } = body
		const root = VolumeClient.getWorkspaceRoot(this.params.tenantId, this.params.projectId, this.params.userId)
		const filePath = path.join(root, workspace_id, file_path)
		await fsPromises.mkdir(path.dirname(filePath), { recursive: true })
		await fsPromises.writeFile(filePath, file_contents)

		// Save file_description in a sidecar .meta file
		// if (file_description) {
		// 	const metaPath = filePath + '.meta.json'
		// 	await fsPromises.writeFile(metaPath, JSON.stringify({ description: file_description }, null, 2))
		// }

		return {
			message: 'File created successfully'
		}
	}

	async listFiles(body: TListFilesReq, options: { signal: AbortSignal }): Promise<TListFilesResponse> {
		const { workspace_id, path: dirPath = '', depth = 2, limit = 1000 } = body

		const client = new VolumeClient({
			tenantId: this.params.tenantId,
			projectId: this.params.projectId,
			userId: this.params.userId
		})

		const files = await client.list({
			path: path.join(workspace_id, dirPath),
			deepth: depth
		})

		return {
			files: files.map((item) => {
				return {
					name: item.filePath,
					extension: item.fileType,
					size: item.size,
					created_date: item.createdAt.toISOString()
				}
			})
		}
	}

	async readFile(req: TReadFileReq, options?: { signal: AbortSignal }): Promise<string> {
		const { workspace_id, file_path, line_from, line_to } = req
		const client = new VolumeClient({
			tenantId: this.params.tenantId,
			projectId: this.params.projectId,
			userId: this.params.userId
		})

		const content = await client.readFile(path.join(workspace_id, file_path))
		if (line_from !== undefined && line_to !== undefined) {
			const lines = content.split('\n').slice(line_from - 1, line_to)
			return lines.join('\n')
		}
		return content
	}

	deleteFile(body: TFileBaseReq, options?: { signal: AbortSignal }): Promise<void> {
		const { workspace_id, file_path } = body
		const client = new VolumeClient({
			tenantId: this.params.tenantId,
			projectId: this.params.projectId,
			userId: this.params.userId
		})

		return client.deleteFile(path.join(workspace_id, file_path))
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

export class SandboxLocal extends Sandbox {
	fs = new FileLocalSystem(this.params)
	project = new MockProjectClient(this.params)
	python = new MockPythonClient(this.params)
	git = new GitLocalClient(this.params)
}

export class GitLocalClient extends GitClient {
	async getWorkspacePath() {
		return await VolumeClient.getWorkspacePath(
			this.params.tenantId,
			this.params.projectId,
			this.params.userId,
			this.params.conversationId
		)
	}

	async execGit(command: string, repoPath: string) {
		// Validate the repository path
		if (!repoPath) {
			throw new Error(`Repository path is empty`)
		}
		const workspace = await this.getWorkspacePath()
		return await execPromise(command, { cwd: path.join(workspace, repoPath) })
	}

	async clone(url: string, repoPath?: string, branch?: string) {
		// Target folder path must be a relative path in local.
		if (repoPath && path.isAbsolute(repoPath)) {
			throw new Error(`Target path must be a relative path`)
		}

		// Construct git clone command
		let command = `git clone `
		if (branch) {
			command += `-b ${branch} `
		}
		command += url
		if (repoPath) {
			command += ` ${repoPath}`
		}

		const workspace = await this.getWorkspacePath()
		const target = repoPath ? path.join(workspace, repoPath) : workspace
		const { stdout, stderr } = await execPromise(command, { cwd: target })
		if (stderr) console.error(stderr)
		return stdout.trim()
	}

	async status(repoPath: string) {
		// Validate the repository path
		if (!repoPath) {
			throw new Error(`Repository path is empty`)
		}
		// Construct git status command
		const command = `git status`

		const { stdout, stderr } = await this.execGit(command, repoPath)
		if (stderr) console.error(stderr)
		return stdout.trim()
	}

	async branches(repoPath: string) {
		const command = `git branch --all`
		const { stdout, stderr } = await this.execGit(command, repoPath)
		if (stderr) console.error(stderr)
		return stdout.trim()
	}

	async createBranch(repoPath: string, branchName: string) {
		if (!branchName) {
			throw new Error(`Branch name is empty`)
		}
		const command = `git checkout -b ${branchName}`
		const { stdout, stderr } = await this.execGit(command, repoPath)
		if (stderr) console.error(stderr)
		return stdout.trim()
	}

	async checkoutBranch(repoPath: string, branchName: string) {
		if (!branchName) {
			throw new Error(`Branch name is empty`)
		}
		const command = `git checkout ${branchName}`
		const { stdout, stderr } = await this.execGit(command, repoPath)
		if (stderr) console.error(stderr)
		return stdout.trim()
	}

	async deleteBranch(repoPath: string, branchName: string) {
		if (!branchName) {
			throw new Error(`Branch name is empty`)
		}
		const command = `git branch -d ${branchName}`
		const { stdout, stderr } = await this.execGit(command, repoPath)
		if (stderr) console.error(stderr)
		return stdout.trim()
	}

	async add(repoPath: string, files: string[]) {
		const command = `git add ${files.join(' ')}`
		const { stdout, stderr } = await this.execGit(command, repoPath)
		if (stderr) console.error(stderr)
		return stdout.trim()
	}

	async commit(repoPath: string, message: string) {
		const command = `git commit -m "${message}"`
		const { stdout, stderr } = await this.execGit(command, repoPath)
		if (stderr) console.error(stderr)
		return stdout.trim()
	}

	async push(repoPath: string, params?: { username?: string; password?: string; createBranch?: string }) {
		const { createBranch } = params || {}
		const command = createBranch ? `git push --set-upstream origin ${createBranch}` : `git push`
		const { stdout, stderr } = await this.execGit(command, repoPath)
		if (stderr) console.error(stderr)
		return stdout.trim()
	}

	async pull(repoPath: string) {
		const command = `git pull`
		const { stdout, stderr } = await this.execGit(command, repoPath)
		if (stderr) console.error(stderr)
		return stdout.trim()
	}

	async setRemote(repoPath: string, name: string, url: string) {
		const { stdout, stderr } = await this.execGit(`git remote set-url ${name} ${url}`, repoPath)
		if (stderr) console.error(stderr)
		return stdout.trim()
	}

	async currentBranch(repoPath: string) {
		const command = `git rev-parse --abbrev-ref HEAD`
		const { stdout, stderr } = await this.execGit(command, repoPath)
		if (stderr) console.error(stderr)
		return stdout.trim()
	}
}
