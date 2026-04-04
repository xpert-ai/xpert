import { ISkillRepository, ISkillRepositoryIndex, TSkillSourceMeta } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { ISkillSourceProvider, SkillSourceProviderStrategy } from '@xpert-ai/plugin-sdk'
import { access, cp, mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join, posix, relative } from 'path'
import unzipper from 'unzipper'
import { IClawHubSkillRepositoryCredentials, IClawHubSkillRepositoryOptions } from './types'

export const CLAWHUB_SKILL_SOURCE_PROVIDER = 'clawhub'
export const DEFAULT_CLAWHUB_REGISTRY_URL = 'https://clawhub.ai'

type ClawHubPackageListItem = {
	name: string
	displayName?: string | null
	summary?: string | null
	latestVersion?: string | null
}

type ClawHubPackageListResponse = {
	items: ClawHubPackageListItem[]
	nextCursor: string | null
}

type ClawHubSkillListItem = {
	slug: string
	displayName?: string | null
	summary?: string | null
	latestVersion?: {
		version?: string | null
	} | null
}

type ClawHubSkillListResponse = {
	items: ClawHubSkillListItem[]
	nextCursor: string | null
}

const CLAWHUB_LIST_LIMIT = 100
const CLAWHUB_RATE_LIMIT_RETRIES = 2
const CLAWHUB_RATE_LIMIT_BASE_DELAY_MS = 1_000
const CLAWHUB_RATE_LIMIT_MAX_DELAY_MS = 30_000

class ClawHubHttpError extends Error {
	constructor(
		readonly context: string,
		readonly status: number,
		readonly statusText: string,
		readonly detail: string,
		readonly retryAfterMs?: number
	) {
		super(`${context} request failed: ${status} ${statusText}${detail ? ` - ${detail}` : ''}`)
		this.name = 'ClawHubHttpError'
	}
}

const buildHeaders = (token?: string, accept = 'application/json') => {
	const headers: Record<string, string> = {
		Accept: accept,
		'User-Agent': 'xpert-ai-skill-installer'
	}

	if (token) {
		headers.Authorization = `Bearer ${token}`
	}

	return headers
}

const normalizeRegistryUrl = (repository?: ISkillRepository) => {
	const options = repository?.options as IClawHubSkillRepositoryOptions | undefined
	const registryUrl = options?.registryUrl?.trim() || DEFAULT_CLAWHUB_REGISTRY_URL
	return registryUrl.replace(/\/+$/, '')
}

const buildRegistryUrl = (registryUrl: string, path: string) => {
	return new URL(`${registryUrl}/${path.replace(/^\/+/, '')}`)
}

const resolveToken = (repository?: ISkillRepository) => {
	const credentials = repository?.credentials as IClawHubSkillRepositoryCredentials | undefined
	return credentials?.token?.trim() || undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const isNullableString = (value: unknown): value is string | null | undefined =>
	value == null || typeof value === 'string'

const isPackageListItem = (value: unknown): value is ClawHubPackageListItem =>
	isRecord(value) &&
	typeof value.name === 'string' &&
	value.name.trim().length > 0 &&
	isNullableString(value.displayName) &&
	isNullableString(value.summary) &&
	isNullableString(value.latestVersion)

const isPackageListResponse = (value: unknown): value is ClawHubPackageListResponse =>
	isRecord(value) &&
	Array.isArray(value.items) &&
	value.items.every(isPackageListItem) &&
	isNullableString(value.nextCursor)

const isSkillVersion = (value: unknown): value is { version?: string | null } =>
	value == null || (isRecord(value) && isNullableString(value.version))

const isSkillListItem = (value: unknown): value is ClawHubSkillListItem =>
	isRecord(value) &&
	typeof value.slug === 'string' &&
	value.slug.trim().length > 0 &&
	isNullableString(value.displayName) &&
	isNullableString(value.summary) &&
	isSkillVersion(value.latestVersion)

const isSkillListResponse = (value: unknown): value is ClawHubSkillListResponse =>
	isRecord(value) &&
	Array.isArray(value.items) &&
	value.items.every(isSkillListItem) &&
	isNullableString(value.nextCursor)

const normalizeRemotePath = (filePath: string) => {
	const normalized = posix.normalize(filePath.replace(/\\/g, '/')).replace(/^\/+/, '')
	if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
		throw new Error(`Unsafe archive entry path: ${filePath}`)
	}
	return normalized
}

const normalizeInstallSlug = (slug: string) => {
	const normalized = slug.trim()
	if (!normalized || normalized.includes('/') || normalized.includes('\\') || normalized.includes('..')) {
		throw new Error(`Unsafe ClawHub skill slug: ${slug}`)
	}
	return normalized
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))

const parseRetryAfterMs = (value?: string | null) => {
	const normalized = value?.trim()
	if (!normalized) {
		return null
	}

	const seconds = Number(normalized)
	if (Number.isFinite(seconds) && seconds >= 0) {
		return Math.min(seconds * 1_000, CLAWHUB_RATE_LIMIT_MAX_DELAY_MS)
	}

	const retryAt = Date.parse(normalized)
	if (!Number.isNaN(retryAt)) {
		return Math.min(Math.max(retryAt - Date.now(), 0), CLAWHUB_RATE_LIMIT_MAX_DELAY_MS)
	}

	return null
}

const isClawHubHttpError = (error: unknown): error is ClawHubHttpError => error instanceof ClawHubHttpError

const isRateLimitedError = (error: unknown): error is ClawHubHttpError =>
	isClawHubHttpError(error) && error.status === 429

const resolveRetryDelayMs = (error: ClawHubHttpError, attempt: number) => {
	if (error.retryAfterMs != null) {
		return error.retryAfterMs
	}

	return Math.min(CLAWHUB_RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt, CLAWHUB_RATE_LIMIT_MAX_DELAY_MS)
}

const shouldFallbackToSkillsApi = (error: unknown) => !isRateLimitedError(error)

const getRateLimitHint = (repository: ISkillRepository, error: unknown) =>
	!resolveToken(repository) && isRateLimitedError(error)
		? ' Configure repository credentials.token to avoid anonymous ClawHub rate limits.'
		: ''

async function parseJsonResponse(response: Response) {
	try {
		return await response.json()
	} catch (error) {
		throw new Error(`Invalid JSON response: ${getErrorMessage(error)}`)
	}
}

async function ensureResponseOk(response: Response, context: string) {
	if (response.ok) {
		return
	}

	const body = (await response.text()).trim()
	throw new ClawHubHttpError(
		context,
		response.status,
		response.statusText,
		body.slice(0, 300),
		parseRetryAfterMs(response.headers.get('retry-after'))
	)
}

async function fetchWithRateLimitRetry(url: string, init: RequestInit, context: string) {
	for (let attempt = 0; attempt <= CLAWHUB_RATE_LIMIT_RETRIES; attempt++) {
		const response = await fetch(url, init)

		try {
			await ensureResponseOk(response, context)
			return response
		} catch (error) {
			if (!isRateLimitedError(error) || attempt === CLAWHUB_RATE_LIMIT_RETRIES) {
				throw error
			}

			await sleep(resolveRetryDelayMs(error, attempt))
		}
	}

	throw new Error(`${context} request failed after retry exhaustion`)
}

async function installArchiveToTemp(buffer: Buffer, outputDir: string) {
	const archive = await unzipper.Open.buffer(buffer)
	let hasRootSkillFile = false

	for (const file of archive.files) {
		if (file.type !== 'File') {
			continue
		}

		const normalizedPath = normalizeRemotePath(file.path)
		if (normalizedPath === '_meta.json') {
			continue
		}
		if (normalizedPath === 'SKILL.md') {
			hasRootSkillFile = true
		}

		const outputPath = join(outputDir, normalizedPath)
		await mkdir(dirname(outputPath), { recursive: true })
		await writeFile(outputPath, await file.buffer())
	}

	if (!hasRootSkillFile) {
		throw new Error('ClawHub skill archive must contain a root SKILL.md file')
	}

	await access(join(outputDir, 'SKILL.md'))
}

@Injectable()
@SkillSourceProviderStrategy(CLAWHUB_SKILL_SOURCE_PROVIDER)
export class ClawHubSkillSourceProvider implements ISkillSourceProvider {
	readonly type = CLAWHUB_SKILL_SOURCE_PROVIDER

	readonly meta: TSkillSourceMeta = {
		name: CLAWHUB_SKILL_SOURCE_PROVIDER,
		label: {
			en_US: 'ClawHub',
			zh_Hans: 'ClawHub'
		},
		description: {
			en_US: 'Sync official ClawHub skills and install them into workspace storage.',
			zh_Hans: '同步 ClawHub 官方技能，并安装到工作区存储。'
		},
		configSchema: {
			type: 'object',
			properties: {
				registryUrl: {
					type: 'string',
					default: DEFAULT_CLAWHUB_REGISTRY_URL,
					title: {
						en_US: 'Registry URL',
						zh_Hans: '仓库地址'
					},
					description: {
						en_US: 'ClawHub registry base URL. Defaults to https://clawhub.ai.',
						zh_Hans: 'ClawHub 注册表基础地址，默认为 https://clawhub.ai。'
					}
				}
			}
		},
		credentialSchema: {
			type: 'object',
			properties: {
				token: {
					type: 'string',
					title: {
						en_US: 'API Token',
						zh_Hans: 'API Token'
					},
					description: {
						en_US: 'Optional Bearer token for authenticated requests and higher rate limits.',
						zh_Hans: '可选 Bearer Token，用于认证请求和更高的速率限制。'
					},
					'x-ui': {
						component: 'password'
					}
				}
			}
		}
	}

	canHandle(sourceType: string): boolean {
		return sourceType === CLAWHUB_SKILL_SOURCE_PROVIDER
	}

	async listSkills(repository: ISkillRepository): Promise<ISkillRepositoryIndex[]> {
		try {
			return await this.listSkillsFromPackages(repository)
		} catch (packagesError) {
			if (!shouldFallbackToSkillsApi(packagesError)) {
				throw new Error(
					`Failed to list skills from ClawHub packages API: ${getErrorMessage(packagesError)}${getRateLimitHint(
						repository,
						packagesError
					)}`
				)
			}

			try {
				// Fallback keeps sync resilient for endpoint drift, but it does not preserve
				// the official-only filter and should not be used for rate-limit errors.
				return await this.listSkillsFromSkillsApi(repository)
			} catch (fallbackError) {
				throw new Error(
					`Failed to list skills from ClawHub packages API: ${getErrorMessage(packagesError)}. ` +
						`Fallback /api/v1/skills failed: ${getErrorMessage(fallbackError)}${getRateLimitHint(
							repository,
							fallbackError
						)}`
				)
			}
		}
	}

	private async listSkillsFromPackages(repository: ISkillRepository): Promise<ISkillRepositoryIndex[]> {
		const registryUrl = normalizeRegistryUrl(repository)
		const token = resolveToken(repository)
		const items: ISkillRepositoryIndex[] = []
		let cursor: string | null = null

		do {
			const url = buildRegistryUrl(registryUrl, '/api/v1/packages')
			url.searchParams.set('family', 'skill')
			url.searchParams.set('isOfficial', 'true')
			url.searchParams.set('limit', String(CLAWHUB_LIST_LIMIT))
			if (cursor) {
				url.searchParams.set('cursor', cursor)
			}

			const response = await fetchWithRateLimitRetry(
				url.toString(),
				{
					headers: buildHeaders(token)
				},
				'ClawHub packages API'
			)

			const payload = await parseJsonResponse(response)
			if (!isPackageListResponse(payload)) {
				throw new Error('Unexpected ClawHub packages response shape')
			}

			items.push(
				...payload.items.map((item) => ({
					repositoryId: repository.id,
					skillId: item.name,
					skillPath: item.name,
					name: item.displayName || item.name,
					description: item.summary || undefined,
					version: item.latestVersion || undefined,
					tags: ['marketplace', 'clawhub', 'official']
				}))
			)

			cursor = payload.nextCursor ?? null
		} while (cursor)

		return items
	}

	private async listSkillsFromSkillsApi(repository: ISkillRepository): Promise<ISkillRepositoryIndex[]> {
		const registryUrl = normalizeRegistryUrl(repository)
		const token = resolveToken(repository)
		const items: ISkillRepositoryIndex[] = []
		let cursor: string | null = null

		do {
			const url = buildRegistryUrl(registryUrl, '/api/v1/skills')
			url.searchParams.set('limit', String(CLAWHUB_LIST_LIMIT))
			if (cursor) {
				url.searchParams.set('cursor', cursor)
			}

			const response = await fetchWithRateLimitRetry(
				url.toString(),
				{
					headers: buildHeaders(token)
				},
				'ClawHub skills API'
			)

			const payload = await parseJsonResponse(response)
			if (!isSkillListResponse(payload)) {
				throw new Error('Unexpected ClawHub skills response shape')
			}

			items.push(
				...payload.items.map((item) => ({
					repositoryId: repository.id,
					skillId: item.slug,
					skillPath: item.slug,
					name: item.displayName || item.slug,
					description: item.summary || undefined,
					version: item.latestVersion?.version || undefined,
					tags: ['marketplace', 'clawhub']
				}))
			)

			cursor = payload.nextCursor ?? null
		} while (cursor)

		return items
	}

	async installSkillPackage(index: ISkillRepositoryIndex, installDir: string): Promise<string> {
		if (!index.repository) {
			throw new Error('Skill repository context is required to install a ClawHub package')
		}

		const registryUrl = normalizeRegistryUrl(index.repository)
		const token = resolveToken(index.repository)
		const skillSlug = normalizeInstallSlug(index.skillId)
		const url = buildRegistryUrl(registryUrl, '/api/v1/download')
		url.searchParams.set('slug', skillSlug)
		if (index.version) {
			url.searchParams.set('version', index.version)
		}

		const response = await fetchWithRateLimitRetry(
			url.toString(),
			{
				headers: buildHeaders(token, 'application/zip')
			},
			'ClawHub download API'
		)

		const archiveBuffer = Buffer.from(await response.arrayBuffer())
		const tempDir = await mkdtemp(join(tmpdir(), 'clawhub-skill-'))
		const extractedSkillRoot = join(tempDir, 'skill')
		const targetPath = join(installDir, 'clawhub', skillSlug)

		try {
			await mkdir(extractedSkillRoot, { recursive: true })
			await installArchiveToTemp(archiveBuffer, extractedSkillRoot)
			await rm(targetPath, { recursive: true, force: true })
			await mkdir(dirname(targetPath), { recursive: true })
			await cp(extractedSkillRoot, targetPath, { recursive: true })
			return relative(installDir, targetPath)
		} finally {
			await rm(tempDir, { recursive: true, force: true })
		}
	}

	async uninstallSkillPackage(path: string): Promise<void> {
		if (!path) {
			return
		}
		await rm(path, { recursive: true, force: true })
	}
}
