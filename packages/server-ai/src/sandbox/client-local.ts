import { exec } from 'node:child_process'
import path from 'node:path'
import util from 'node:util'
import { VolumeClient } from '../shared'
import {
	GitClient,
	ProjectClient,
	PythonClient,
	Sandbox,
	SandboxFileSystem,
	TCreateFileResp,
	TProjectDeployParams
} from './client'

// Convert exec to return a promise
const execPromise = util.promisify(exec)

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

export class SandboxLocal extends Sandbox {
	fs = new MockFileSystem(this.sandboxUrl)
	project = new MockProjectClient(this.params)
	python = new MockPythonClient(this.params)
	git = new GitLocalClient(this.params)

	async doRequest(path: string, requestData: any, options: { signal: AbortSignal }) {
		return
	}
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

	async push(repoPath: string, params?: {username?: string; password?: string; createBranch?: string}) {
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
