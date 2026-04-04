import {
	ISkillRepository,
	ISkillRepositoryIndex,
	ISkillRepositoryIndexPublisher,
	ISkillRepositoryIndexStats,
	TSkillSourceMeta
} from '@metad/contracts'
import { InjectQueue } from '@nestjs/bull'
import { Injectable } from '@nestjs/common'
import { ISkillSourceProvider, SkillSourceProviderStrategy } from '@xpert-ai/plugin-sdk'
import { cp, mkdtemp, mkdir, readdir, rm, stat, writeFile, readFile } from 'fs/promises'
import { Queue } from 'bull'
import { tmpdir } from 'os'
import { join, relative } from 'path'
import * as tar from 'tar'
import { GITHUB_REQUEST_QUEUE } from './github.constants'
import { GithubRequestInit, GithubRequestJob, GithubResponse } from './github-request.job'
import { IGitHubSkillRepositoryOptions } from './types'

const GITHUB_SKILL_SOURCE_PROVIDER = 'github'

type GithubRepositoryOwnerResponse = {
	login?: string | null
	avatar_url?: string | null
	type?: string | null
}

type GithubRepositoryResponseData = {
	default_branch?: string | null
	stargazers_count?: number | null
	html_url?: string | null
	owner?: GithubRepositoryOwnerResponse | null
}

type GithubUserResponseData = {
	login?: string | null
	name?: string | null
	avatar_url?: string | null
	type?: string | null
}

type GithubRepositoryMetadata = {
	defaultBranch?: string
	publisher?: ISkillRepositoryIndexPublisher
	stats?: ISkillRepositoryIndexStats
}

type GithubRepositoryIdentity = {
	owner: string
	repo: string
	normalizedRepoUrl: string
}

type GithubSkillContext = {
	repositoryId: string
	repoUrl: string
	repositoryPath: string
	branch: string
	publisher?: ISkillRepositoryIndexPublisher
	stats?: ISkillRepositoryIndexStats
}

const buildGithubHeaders = (token?: string): Record<string, string> => {
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github+json',
		'User-Agent': 'xpert-ai-skill-installer'
	}

	if (token) {
		headers.Authorization = `Bearer ${token}`
	}

	return headers
}

const resolveGithubToken = (repository?: ISkillRepository) => repository?.credentials?.token as string || process.env.GITHUB_TOKEN
const normalizeRepositoryPath = (repositoryPath?: string) => {
	if (!repositoryPath) {
		return ''
	}

	const trimmed = repositoryPath.trim()
	if (!trimmed) {
		return ''
	}

	return trimmed.replace(/^\/+/, '').replace(/\/+$/, '')
}

const parseGithubRepositoryUrl = (repoUrl: string): GithubRepositoryIdentity => {
	const url = new URL(repoUrl)
	if (url.hostname !== 'github.com') {
		throw new Error('Only GitHub repositories are supported.')
	}

	const [owner, repo] = url.pathname.replace(/^\/+/, '').split('/')
	if (!owner || !repo) {
		throw new Error('Invalid GitHub repository URL.')
	}

	return {
		owner,
		repo,
		normalizedRepoUrl: `https://github.com/${owner}/${repo}`
	}
}

const buildTarballUrl = (repoUrl: string, branch?: string) => {
	const { owner, repo } = parseGithubRepositoryUrl(repoUrl)
	return {
		owner,
		repo,
		url: `https://api.github.com/repos/${owner}/${repo}/tarball/${branch || 'main'}`
	}
}

const normalizePublisherKind = (type?: string | null) => {
	if (typeof type !== 'string' || !type.trim()) {
		return undefined
	}

	return type.trim().toLowerCase()
}

const buildGithubPublisherFallback = (owner: string): ISkillRepositoryIndexPublisher => ({
	handle: owner,
	displayName: owner,
	name: owner
})

const encodeGithubPath = (...paths: string[]) =>
	paths
		.flatMap((path) => normalizeRepositoryPath(path).split('/'))
		.filter(Boolean)
		.map((segment) => encodeURIComponent(segment))
		.join('/')

const buildGithubSkillLink = (repoUrl: string, branch: string, repositoryPath: string, skillPath: string) => {
	const { normalizedRepoUrl } = parseGithubRepositoryUrl(repoUrl)
	const skillFilePath = encodeGithubPath(repositoryPath, skillPath, 'SKILL.md')

	return skillFilePath
		? `${normalizedRepoUrl}/blob/${branch}/${skillFilePath}`
		: `${normalizedRepoUrl}/blob/${branch}/SKILL.md`
}

const downloadTarballToTemp = async (
	queue: Queue<GithubRequestJob>,
	repoUrl: string,
	branch: string,
	headers: Record<string, string>
) => {
	const { repo, url } = buildTarballUrl(repoUrl, branch)
	const tempDir = await mkdtemp(join(tmpdir(), 'github-skill-'))
	const tarballPath = join(tempDir, `${repo}.tar.gz`)
	const res = await throttledFetch<Buffer>(queue, url, { headers, responseType: 'arrayBuffer' })
	await ensureGithubOk(res)

	await writeFile(tarballPath, Buffer.from(res.data))
	await tar.x({ file: tarballPath, cwd: tempDir })

	const entries = await readdir(tempDir, { withFileTypes: true })
	const rootFolder = entries.find((entry) => entry.isDirectory())
	if (!rootFolder) {
		throw new Error('Failed to unpack GitHub tarball')
	}

	const repoRoot = join(tempDir, rootFolder.name)
	return { tempDir, repoRoot }
}

const throttledFetch = async <T = any>(
	queue: Queue<GithubRequestJob>,
	url: string,
	init: GithubRequestInit
): Promise<GithubResponse<T>> => {
	const job = await queue.add(
		'request',
		{
			url,
			init
		},
		{
			removeOnComplete: true,
			removeOnFail: true
		}
	)

	return (await job.finished()) as GithubResponse<T>
}

async function ensureGithubOk(res: GithubResponse<any>) {
	if (res.ok) {
		return
	}

	const remaining = res.headers?.['x-ratelimit-remaining']
	let detail = ''
	const message = typeof res.data === 'object' ? res.data?.message : ''
	detail = message ?? ''

	if (res.status === 403 && remaining === '0') {
		throw new Error('GitHub API error: 403 rate limit exceeded')
	}

	throw new Error(`GitHub API error: ${res.status} ${res.statusText}${detail ? ` - ${detail}` : ''}`)
}

async function fetchGithubRepositoryMetadata(
	queue: Queue<GithubRequestJob>,
	repoUrl: string,
	headers: Record<string, string>
): Promise<GithubRepositoryMetadata> {
	const { owner, repo } = parseGithubRepositoryUrl(repoUrl)
	const repoResponse = await throttledFetch<GithubRepositoryResponseData>(queue, `https://api.github.com/repos/${owner}/${repo}`, {
		headers
	})
	await ensureGithubOk(repoResponse)

	const repoData = (repoResponse.data ?? {}) as GithubRepositoryResponseData
	const repoOwner = repoData.owner ?? {}
	const ownerLogin = repoOwner.login?.trim() || owner

	let userData: GithubUserResponseData | undefined
	try {
		const userResponse = await throttledFetch<GithubUserResponseData>(queue, `https://api.github.com/users/${ownerLogin}`, {
			headers
		})
		await ensureGithubOk(userResponse)
		userData = (userResponse.data ?? {}) as GithubUserResponseData
	} catch {
		userData = undefined
	}

	const displayName = userData?.name?.trim() || userData?.login?.trim() || ownerLogin
	const publisher: ISkillRepositoryIndexPublisher = {
		handle: ownerLogin,
		displayName,
		name: displayName,
		image: userData?.avatar_url?.trim() || repoOwner.avatar_url?.trim() || undefined,
		kind: normalizePublisherKind(userData?.type) || normalizePublisherKind(repoOwner.type)
	}

	const stars =
		typeof repoData.stargazers_count === 'number' && Number.isFinite(repoData.stargazers_count)
			? Math.trunc(repoData.stargazers_count)
			: undefined

	return {
		defaultBranch: repoData.default_branch?.trim() || undefined,
		publisher,
		stats: typeof stars === 'number' ? { stars } : undefined
	}
}

@Injectable()
@SkillSourceProviderStrategy(GITHUB_SKILL_SOURCE_PROVIDER)
export class GitHubSkillSourceProvider implements ISkillSourceProvider {
	readonly type = 'git'
	readonly meta: TSkillSourceMeta = {
		name: 'github',
		label: {
			en_US: 'GitHub',
			zh_Hans: 'GitHub'
		},
		icon: { type: 'svg', value: `` },
		configSchema: {
			type: 'object',
			properties: {
				url: {
					type: 'string',
					title: {
						en_US: 'Repository URL',
						zh_Hans: '仓库地址'
					},
					description: {
						en_US: 'The URL of the GitHub repository containing the skills.',
						zh_Hans: '包含技能的 GitHub 仓库地址。'
					}
				},
				path: {
					type: 'string',
					title: {
						en_US: 'Skills Path',
						zh_Hans: '技能路径'
					},
					description: {
						en_US: 'The path within the repository where the skills are located (default: root directory).',
						zh_Hans: '仓库中技能所在的路径（默认：根目录）。'
					}
				},
				branch: {
					type: 'string',
					title: {
						en_US: 'Branch',
						zh_Hans: '分支'
					},
					description: {
						en_US: 'The branch to use (default: main).',
						zh_Hans: '使用的分支（默认：main）。'
					}
				}
			},
			required: ['url']	
		},
		credentialSchema: {
			type: 'object',
			properties: {
				token: {
					type: 'string',
					title: {
						en_US: 'Personal Access Token',
						zh_Hans: '个人访问令牌'
					},
					description: {
						en_US: 'Personal Access Token for accessing private repositories',
						zh_Hans: '用于访问私有仓库的个人访问令牌'
					},
					'x-ui': {
						component: 'password'
					}
				}
			},
			required: []
		}
	}

	constructor(@InjectQueue(GITHUB_REQUEST_QUEUE) private readonly githubQueue: Queue<GithubRequestJob>) {}

	canHandle(sourceType: string): boolean {
		return sourceType === GITHUB_SKILL_SOURCE_PROVIDER || sourceType === 'github'
	}
	
	async listSkills(repository: ISkillRepository): Promise<ISkillRepositoryIndex[]> {
		const repositoryOptions = repository.options as unknown as IGitHubSkillRepositoryOptions
		return await scanGithubSkills(this.githubQueue, repositoryOptions.url, repository.id, repository)
	}

	/**
	 * Install skill package from GitHub repository to local workspace skills directory
	 * @param index Skill repository index entry
	 * @param installDir Local installation directory
	 */
	async installSkillPackage(index: ISkillRepositoryIndex, installDir: string) {
		if (!index.repository) {
			throw new Error('Skill repository context is required to fetch package.')
		}
		const options = index.repository.options as unknown as IGitHubSkillRepositoryOptions
		const repoUrl = options.url
		const token = resolveGithubToken(index.repository)
		const headers = buildGithubHeaders(token)
		let repositoryMetadata: GithubRepositoryMetadata | undefined
		try {
			repositoryMetadata = await fetchGithubRepositoryMetadata(this.githubQueue, repoUrl, headers)
		} catch {
			repositoryMetadata = undefined
		}
		const branch = options.branch || repositoryMetadata?.defaultBranch || 'main'

		const { owner, repo } = parseGithubRepositoryUrl(repoUrl)
		
		const skillRoot = join(installDir, owner, repo, index.skillPath)

		await mkdir(skillRoot, { recursive: true })

		const { tempDir, repoRoot } = await downloadTarballToTemp(this.githubQueue, repoUrl, branch, headers)
		try {
			const repositoryPath = normalizeRepositoryPath(options.path)
			const skillsRoot = repositoryPath ? join(repoRoot, repositoryPath) : repoRoot
			const skillSourcePath = join(skillsRoot, index.skillPath)
			await cp(skillSourcePath, skillRoot, { recursive: true })
			return relative(installDir, skillRoot)
		} finally {
			await rm(tempDir, { recursive: true, force: true })
		}
	}

	async uninstallSkillPackage(path: string) {
		if (!path) {
			return
		}
		await rm(path, { recursive: true, force: true })
	}
}

/**
 * GitHub 仓库扫描，查找 skill 目录 （含 SKILL.md）
 */
export async function scanGithubSkills(
	queue: Queue,
	repoUrl: string,
	repositoryId: string,
	repository?: ISkillRepository
): Promise<ISkillRepositoryIndex[]> {
	const token = resolveGithubToken(repository)
	const headers = buildGithubHeaders(token)
	const repositoryOptions = repository?.options as unknown as IGitHubSkillRepositoryOptions
	const repositoryPath = normalizeRepositoryPath(repositoryOptions?.path)
	const { owner } = parseGithubRepositoryUrl(repoUrl)
	let repositoryMetadata: GithubRepositoryMetadata | undefined
	try {
		repositoryMetadata = await fetchGithubRepositoryMetadata(queue as Queue<GithubRequestJob>, repoUrl, headers)
	} catch {
		repositoryMetadata = undefined
	}
	const branch = repositoryOptions?.branch || repositoryMetadata?.defaultBranch || 'main'

	// 遍历整个仓库，记录每个目录是否含 SKILL.md
	const skills: ISkillRepositoryIndex[] = []

	const { tempDir, repoRoot } = await downloadTarballToTemp(queue as Queue<GithubRequestJob>, repoUrl, branch, headers)

	try {
		const skillsRoot = repositoryPath ? join(repoRoot, repositoryPath) : repoRoot
		if (repositoryPath) {
			await ensureSkillsRoot(repoRoot, skillsRoot, repositoryOptions?.path)
		}

		await scanDirectory(skills, skillsRoot, '', {
			repositoryId,
			repoUrl,
			repositoryPath,
			branch,
			publisher: repositoryMetadata?.publisher ?? buildGithubPublisherFallback(owner),
			stats: repositoryMetadata?.stats
		})
		return skills
	} finally {
		await rm(tempDir, { recursive: true, force: true })
	}
}

async function resolveSkillMetadataFromFs(skillMdPath: string) {
	try {
		const content = await readFile(skillMdPath, 'utf8')
		const frontMatterMatch = content.match(/^---\s*([\s\S]*?)\s*---/)
		if (!frontMatterMatch) {
			return null
		}

		const frontMatter = frontMatterMatch[1]
		const metadata: Record<string, string> = {}

		for (const rawLine of frontMatter.split('\n')) {
			const line = rawLine.trim()
			if (!line || line.startsWith('#')) {
				continue
			}

			const colonIndex = line.indexOf(':')
			if (colonIndex === -1) {
				continue
			}

			const key = line.slice(0, colonIndex).trim()
			let value = line.slice(colonIndex + 1).trim()

			if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
				value = value.slice(1, -1)
			}

			metadata[key] = value
		}

		return metadata as {
			name?: string
			description?: string
			license?: string
			version?: string
		}
	} catch {
		return null
	}
}

/**
 * Collect all files and directories under a given skill directory
 * @param skillsRoot 
 * @param absDir 
 * @param list 
 * @returns 
 */
async function collectResourcesFromFs(skillsRoot: string, absDir: string, list: any[] = []): Promise<any[]> {
	const entries = await readdir(absDir, { withFileTypes: true })
	for (const entry of entries) {
		const absPath = join(absDir, entry.name)
		const relPath = relative(skillsRoot, absPath)
		list.push({
			name: entry.name,
			path: relPath,
			type: entry.isDirectory() ? 'dir' : 'file',
			sha: undefined,
			downloadUrl: null
		})

		if (entry.isDirectory()) {
			await collectResourcesFromFs(skillsRoot, absPath, list)
		}
	}
	return list
}

async function scanDirectory(
	skills: ISkillRepositoryIndex[],
	skillsRoot: string,
	name: string,
	context: GithubSkillContext
) {
	const absDir = join(skillsRoot, name ? name : '')
	const entries = await readdir(absDir, { withFileTypes: true })
	const hasSkillMd = entries.some((entry) => entry.isFile() && entry.name.toLowerCase() === 'skill.md')

	if (hasSkillMd) {
		const relDir = relative(skillsRoot, absDir) || ''
		const metadata = await resolveSkillMetadataFromFs(join(absDir, 'SKILL.md'))
		const resources = await collectResourcesFromFs(skillsRoot, absDir, [])

		skills.push({
			repositoryId: context.repositoryId,
			skillPath: relDir,
			skillId: relDir || '/',
			name: metadata?.name || relDir.split('/').pop() || relDir,
			link: buildGithubSkillLink(context.repoUrl, context.branch, context.repositoryPath, relDir),
			publisher: context.publisher,
			description: metadata?.description,
			license: metadata?.license,
			tags: [],
			version: metadata?.version,
			stats: context.stats,
			resources
		})

		return
	}

	for (const entry of entries) {
		if (entry.isDirectory()) {
			await scanDirectory(skills, skillsRoot, join(name, entry.name), context)
		}
	}
}

async function ensureSkillsRoot(repoRoot: string, skillsRoot: string, configuredPath?: string) {
	const relativePath = relative(repoRoot, skillsRoot)
	if (relativePath.startsWith('..')) {
		throw new Error('GitHub repository path must stay within the repository root.')
	}

	try {
		const stats = await stat(skillsRoot)
		if (!stats.isDirectory()) {
			throw new Error(`GitHub repository path "${configuredPath}" is not a directory.`)
		}
	} catch (error: any) {
		if (error?.code === 'ENOENT') {
			throw new Error(`GitHub repository path "${configuredPath}" does not exist.`)
		}
		throw error
	}
}
