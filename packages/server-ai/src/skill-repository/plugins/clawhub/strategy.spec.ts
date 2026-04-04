import archiver from 'archiver'
import { PassThrough } from 'stream'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	SkillSourceProviderStrategy: () => () => undefined
}))

import { CLAWHUB_SKILL_SOURCE_PROVIDER, ClawHubSkillSourceProvider } from './strategy'

describe('ClawHubSkillSourceProvider', () => {
	let provider: ClawHubSkillSourceProvider
	let fetchMock: jest.Mock
	let originalFetch: typeof global.fetch
	const tempDirs: string[] = []

	beforeEach(() => {
		provider = new ClawHubSkillSourceProvider()
		fetchMock = jest.fn()
		originalFetch = global.fetch
		global.fetch = fetchMock as typeof global.fetch
	})

	afterEach(async () => {
		global.fetch = originalFetch
		jest.resetAllMocks()
		await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
	})

	it('lists official skills from the package catalog with pagination and auth', async () => {
		fetchMock
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						items: [
							{
								name: 'weather',
								displayName: 'Weather',
								summary: 'Forecasts',
								latestVersion: '1.0.0'
							}
						],
						nextCursor: 'cursor-2'
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						items: [
							{
								name: 'calendar',
								displayName: 'Calendar',
								summary: 'Calendar helper',
								latestVersion: '2.0.0'
							}
						],
						nextCursor: null
					}),
					{ status: 200 }
				)
			)

		const result = await provider.listSkills({
			id: 'repo-1',
			provider: CLAWHUB_SKILL_SOURCE_PROVIDER,
			options: {
				registryUrl: 'https://clawhub.ai'
			},
			credentials: {
				token: 'secret-token'
			}
		} as any)

		expect(result).toEqual([
			{
				repositoryId: 'repo-1',
				skillId: 'weather',
				skillPath: 'weather',
				name: 'Weather',
				description: 'Forecasts',
				version: '1.0.0',
				tags: ['marketplace', 'clawhub', 'official']
			},
			{
				repositoryId: 'repo-1',
				skillId: 'calendar',
				skillPath: 'calendar',
				name: 'Calendar',
				description: 'Calendar helper',
				version: '2.0.0',
				tags: ['marketplace', 'clawhub', 'official']
			}
		])

		expect(fetchMock).toHaveBeenCalledTimes(2)
		expect(fetchMock.mock.calls[0][0]).toBe(
			'https://clawhub.ai/api/v1/packages?family=skill&isOfficial=true&limit=100'
		)
		expect(fetchMock.mock.calls[1][0]).toBe(
			'https://clawhub.ai/api/v1/packages?family=skill&isOfficial=true&limit=100&cursor=cursor-2'
		)
		expect(fetchMock.mock.calls[0][1]).toEqual(
			expect.objectContaining({
				headers: expect.objectContaining({
					Accept: 'application/json',
					Authorization: 'Bearer secret-token'
				})
			})
		)
	})

	it('retries rate-limited package requests before succeeding', async () => {
		fetchMock
			.mockResolvedValueOnce(
				new Response('Rate limit exceeded', {
					status: 429,
					statusText: 'Too Many Requests',
					headers: {
						'Retry-After': '0'
					}
				})
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						items: [
							{
								name: 'weather',
								displayName: 'Weather',
								summary: 'Forecasts',
								latestVersion: '1.0.0'
							}
						],
						nextCursor: null
					}),
					{ status: 200 }
				)
			)

		const result = await provider.listSkills({
			id: 'repo-1',
			provider: CLAWHUB_SKILL_SOURCE_PROVIDER,
			options: {
				registryUrl: 'https://clawhub.ai'
			}
		} as any)

		expect(result).toEqual([
			{
				repositoryId: 'repo-1',
				skillId: 'weather',
				skillPath: 'weather',
				name: 'Weather',
				description: 'Forecasts',
				version: '1.0.0',
				tags: ['marketplace', 'clawhub', 'official']
			}
		])

		expect(fetchMock).toHaveBeenCalledTimes(2)
		expect(fetchMock.mock.calls[0][0]).toBe(
			'https://clawhub.ai/api/v1/packages?family=skill&isOfficial=true&limit=100'
		)
		expect(fetchMock.mock.calls[1][0]).toBe(
			'https://clawhub.ai/api/v1/packages?family=skill&isOfficial=true&limit=100'
		)
	})

	it('falls back to /api/v1/skills when the package catalog fails', async () => {
		fetchMock
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ items: 'broken' }), {
					status: 200
				})
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						items: [
							{
								slug: 'weather',
								displayName: 'Weather',
								summary: 'Forecasts',
								latestVersion: {
									version: '1.0.0'
								}
							}
						],
						nextCursor: null
					}),
					{ status: 200 }
				)
			)

		const result = await provider.listSkills({
			id: 'repo-1',
			provider: CLAWHUB_SKILL_SOURCE_PROVIDER,
			options: {
				registryUrl: 'https://clawhub.ai'
			}
		} as any)

		expect(result).toEqual([
			{
				repositoryId: 'repo-1',
				skillId: 'weather',
				skillPath: 'weather',
				name: 'Weather',
				description: 'Forecasts',
				version: '1.0.0',
				tags: ['marketplace', 'clawhub']
			}
		])

		expect(fetchMock.mock.calls[0][0]).toBe(
			'https://clawhub.ai/api/v1/packages?family=skill&isOfficial=true&limit=100'
		)
		expect(fetchMock.mock.calls[1][0]).toBe('https://clawhub.ai/api/v1/skills?limit=100')
	})

	it('installs a versioned ClawHub zip and ignores _meta.json', async () => {
		const installDir = await makeTempDir()
		const zipBuffer = await createZipBuffer({
			'SKILL.md': '# Weather skill\n',
			'_meta.json': '{"slug":"weather"}',
			'docs/readme.md': 'hello'
		})

		fetchMock.mockResolvedValue(
			new Response(new Uint8Array(zipBuffer), {
				status: 200,
				headers: {
					'Content-Type': 'application/zip'
				}
			})
		)

		const result = await provider.installSkillPackage(
			{
				skillId: 'weather',
				version: '1.0.0',
				repository: {
					provider: CLAWHUB_SKILL_SOURCE_PROVIDER,
					options: {
						registryUrl: 'https://clawhub.ai'
					},
					credentials: {
						token: 'secret-token'
					}
				}
			} as any,
			installDir
		)

		expect(result).toBe('clawhub/weather')
		expect(fetchMock).toHaveBeenCalledWith(
			'https://clawhub.ai/api/v1/download?slug=weather&version=1.0.0',
			expect.objectContaining({
				headers: expect.objectContaining({
					Accept: 'application/zip',
					Authorization: 'Bearer secret-token'
				})
			})
		)
		await expect(readFile(join(installDir, 'clawhub', 'weather', 'SKILL.md'), 'utf8')).resolves.toContain('Weather')
		await expect(readFile(join(installDir, 'clawhub', 'weather', 'docs', 'readme.md'), 'utf8')).resolves.toBe('hello')
		await expect(stat(join(installDir, 'clawhub', 'weather', '_meta.json'))).rejects.toThrow()
	})

	it('uninstalls the installed ClawHub skill directory', async () => {
		const installDir = await makeTempDir()
		const skillDir = join(installDir, 'clawhub', 'weather')
		await mkdir(skillDir, { recursive: true })
		await writeFile(join(skillDir, 'SKILL.md'), '# Weather\n')

		await provider.uninstallSkillPackage(skillDir)

		await expect(stat(skillDir)).rejects.toThrow()
	})

	it('surfaces a useful error when both list endpoints fail', async () => {
		fetchMock
			.mockResolvedValueOnce(new Response('upstream down', { status: 503, statusText: 'Service Unavailable' }))
			.mockResolvedValueOnce(new Response('still down', { status: 503, statusText: 'Service Unavailable' }))

		await expect(
			provider.listSkills({
				id: 'repo-1',
				provider: CLAWHUB_SKILL_SOURCE_PROVIDER,
				options: {
					registryUrl: 'https://clawhub.ai'
				}
			} as any)
		).rejects.toThrow(
			'Failed to list skills from ClawHub packages API: ClawHub packages API request failed: 503 Service Unavailable - upstream down. Fallback /api/v1/skills failed: ClawHub skills API request failed: 503 Service Unavailable - still down'
		)
	})

	it('does not fall back when the package catalog remains rate limited without a token', async () => {
		fetchMock.mockImplementation(
			() =>
				Promise.resolve(
					new Response('Rate limit exceeded', {
						status: 429,
						statusText: 'Too Many Requests',
						headers: {
							'Retry-After': '0'
						}
					})
				)
		)

		await expect(
			provider.listSkills({
				id: 'repo-1',
				provider: CLAWHUB_SKILL_SOURCE_PROVIDER,
				options: {
					registryUrl: 'https://clawhub.ai'
				}
			} as any)
		).rejects.toThrow(
			'Failed to list skills from ClawHub packages API: ClawHub packages API request failed: 429 Too Many Requests - Rate limit exceeded Configure repository credentials.token to avoid anonymous ClawHub rate limits.'
		)

		expect(fetchMock).toHaveBeenCalledTimes(3)
		expect(fetchMock.mock.calls.every(([url]) => url === 'https://clawhub.ai/api/v1/packages?family=skill&isOfficial=true&limit=100')).toBe(true)
	})

	it('requires a root SKILL.md when installing a ClawHub archive', async () => {
		const installDir = await makeTempDir()
		const zipBuffer = await createZipBuffer({
			'docs/readme.md': 'hello'
		})

		fetchMock.mockResolvedValue(
			new Response(new Uint8Array(zipBuffer), {
				status: 200,
				headers: {
					'Content-Type': 'application/zip'
				}
			})
		)

		await expect(
			provider.installSkillPackage(
				{
					skillId: 'weather',
					repository: {
						provider: CLAWHUB_SKILL_SOURCE_PROVIDER,
						options: {
							registryUrl: 'https://clawhub.ai'
						}
					}
				} as any,
				installDir
			)
		).rejects.toThrow('ClawHub skill archive must contain a root SKILL.md file')
	})

	async function makeTempDir() {
		const dir = await mkdtemp(join(tmpdir(), 'clawhub-provider-spec-'))
		tempDirs.push(dir)
		return dir
	}
})

async function createZipBuffer(entries: Record<string, string>) {
	const archive = archiver('zip', { zlib: { level: 9 } })
	const stream = new PassThrough()
	const chunks: Buffer[] = []

	stream.on('data', (chunk) => {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
	})

	const result = new Promise<Buffer>((resolve, reject) => {
		stream.on('end', () => resolve(Buffer.concat(chunks)))
		stream.on('error', reject)
		archive.on('error', reject)
	})

	archive.pipe(stream)
	for (const [name, content] of Object.entries(entries)) {
		archive.append(content, { name })
	}
	await archive.finalize()
	return result
}
