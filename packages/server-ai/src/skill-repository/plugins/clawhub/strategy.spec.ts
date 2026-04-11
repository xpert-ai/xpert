import 'dotenv/config'
import archiver from 'archiver'
import { PassThrough } from 'stream'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	SkillSourceProviderStrategy: () => () => undefined
}))

import {
	CLAWHUB_SKILL_SOURCE_PROVIDER,
	ClawHubSkillSourceProvider,
	DEFAULT_CLAWHUB_REGISTRY_URL
} from './strategy'

type DefaultSkillRepositoryEntry = {
	name?: string
	provider?: string
	options?: {
		registryUrl?: string
		officialOnly?: boolean
		maxSkills?: number
	}
	credentials?: {
		token?: string
	}
}

type DefaultSkillRepositoryConfig = {
	repositories?: DefaultSkillRepositoryEntry[]
}

const CLAWHUB_LIVE_TEST_FLAG = 'CLAWHUB_LIVE_TEST'

const loadDefaultSkillRepositories = (): DefaultSkillRepositoryEntry[] => {
	const content = process.env.AI_DEFAULT_SKILL_REPOSITORIES?.trim()
	if (!content) {
		return []
	}

	try {
		const parsed = JSON.parse(content) as DefaultSkillRepositoryConfig | DefaultSkillRepositoryEntry[]
		return Array.isArray(parsed) ? parsed : Array.isArray(parsed.repositories) ? parsed.repositories : []
	} catch {
		return []
	}
}

const getClawHubRepositoryFromEnv = () => {
	const repository = loadDefaultSkillRepositories().find((item) => item?.provider === CLAWHUB_SKILL_SOURCE_PROVIDER)
	const token = repository?.credentials?.token?.trim()

	if (!token) {
		return null
	}

	return {
		registryUrl: repository?.options?.registryUrl?.trim() || DEFAULT_CLAWHUB_REGISTRY_URL,
		token
	}
}

const runLiveClawHubTest = process.env[CLAWHUB_LIVE_TEST_FLAG] === '1' ? it : it.skip

describe('ClawHubSkillSourceProvider', () => {
	let provider: ClawHubSkillSourceProvider
	let fetchMock: jest.Mock
	let originalFetch: typeof global.fetch
	const tempDirs: string[] = []
	const publishersBySlug: Record<string, Record<string, string>> = {
		weather: {
			handle: 'weather-team',
			displayName: 'Weather Team',
			name: 'Weather Team',
			image: 'https://example.com/weather.png',
			kind: 'user'
		},
		calendar: {
			handle: 'calendar-labs',
			displayName: 'Calendar Labs',
			name: 'Calendar Labs',
			image: 'https://example.com/calendar.png',
			kind: 'org'
		},
		mcporter: {
			handle: 'openclaw',
			displayName: 'OpenClaw',
			name: 'OpenClaw',
			image: 'https://example.com/openclaw.png',
			kind: 'org'
		},
		'x-search': {
			handle: 'pskoett',
			displayName: 'pskoett',
			name: 'pskoett',
			image: 'https://example.com/pskoett.png',
			kind: 'user'
		}
	}
	const statsBySlug: Record<string, Record<string, number>> = {
		weather: {
			downloads: 346000,
			stars: 2900,
			versions: 25,
			installsAllTime: 5600,
			installsCurrent: 5300,
			comments: 50
		},
		calendar: {
			downloads: 184000,
			stars: 803,
			versions: 1,
			installsAllTime: 1400,
			installsCurrent: 1200,
			comments: 8
		},
		mcporter: {
			downloads: 150000,
			stars: 472,
			versions: 4,
			installsAllTime: 900,
			installsCurrent: 700,
			comments: 5
		},
		'x-search': {
			downloads: 346000,
			stars: 2900,
			versions: 25,
			installsAllTime: 5600,
			installsCurrent: 5300,
			comments: 50
		}
	}
	const linkBySlug = {
		weather: 'https://clawhub.ai/weather-team/weather',
		calendar: 'https://clawhub.ai/calendar-labs/calendar',
		mcporter: 'https://clawhub.ai/openclaw/mcporter',
		'x-search': 'https://clawhub.ai/pskoett/x-search'
	}

	beforeEach(() => {
		provider = new ClawHubSkillSourceProvider()
		fetchMock = jest.fn()
		fetchMock.mockImplementation(async (url, init) => {
			if (String(url) === 'https://wry-manatee-359.convex.cloud/api/query') {
				const body = JSON.parse(String(init?.body ?? '{}'))
				const slug = body?.args?.[0]?.slug
				return new Response(
					JSON.stringify({
							status: 'success',
							value: {
								owner: publishersBySlug[slug] ?? null,
								skill: {
								stats: statsBySlug[slug] ?? {
									downloads: 0,
									stars: 0,
									versions: 0,
									installsAllTime: 0,
									installsCurrent: 0,
									comments: 0
								}
							}
						}
					}),
					{ status: 200 }
				)
			}

			throw new Error(`Unexpected fetch request in test: ${String(url)}`)
		})
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
								family: 'skill',
								isOfficial: true,
								displayName: 'Weather',
								summary: 'Forecasts',
								latestVersion: '1.0.0'
							},
							{
								name: '@openclaw/twitch',
								family: 'code-plugin',
								isOfficial: true,
								displayName: 'Twitch',
								summary: 'Plugin',
								latestVersion: '0.9.0'
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
								family: 'skill',
								isOfficial: true,
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
				link: linkBySlug.weather,
				publisher: publishersBySlug.weather,
				description: 'Forecasts',
				version: '1.0.0',
				stats: statsBySlug.weather,
				tags: ['marketplace', 'clawhub', 'official']
			},
			{
				repositoryId: 'repo-1',
				skillId: 'calendar',
				skillPath: 'calendar',
				name: 'Calendar',
				link: linkBySlug.calendar,
				publisher: publishersBySlug.calendar,
				description: 'Calendar helper',
				version: '2.0.0',
				stats: statsBySlug.calendar,
				tags: ['marketplace', 'clawhub', 'official']
			}
		])

		expect(fetchMock).toHaveBeenCalledTimes(4)
		expect(fetchMock.mock.calls[0][0]).toBe('https://clawhub.ai/api/v1/packages?isOfficial=true&limit=10')
		expect(fetchMock.mock.calls[1][0]).toBe(
			'https://clawhub.ai/api/v1/packages?isOfficial=true&limit=10&cursor=cursor-2'
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

	it('filters the official package catalog to skill entries only', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					items: [
						{
							name: 'mcporter',
							family: 'skill',
							isOfficial: true,
							displayName: 'MCPorter',
							summary: 'Official skill',
							latestVersion: '1.2.3'
						},
						{
							name: '@openclaw/twitch',
							family: 'code-plugin',
							isOfficial: true,
							displayName: 'Twitch',
							summary: 'Official plugin',
							latestVersion: '0.9.0'
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
				skillId: 'mcporter',
				skillPath: 'mcporter',
				name: 'MCPorter',
				link: linkBySlug.mcporter,
				publisher: publishersBySlug.mcporter,
				description: 'Official skill',
				version: '1.2.3',
				stats: statsBySlug.mcporter,
				tags: ['marketplace', 'clawhub', 'official']
			}
		])

		expect(fetchMock).toHaveBeenCalledTimes(2)
		expect(fetchMock.mock.calls[0][0]).toBe('https://clawhub.ai/api/v1/packages?isOfficial=true&limit=10')
		expect(fetchMock.mock.calls[0][1]).toEqual(
			expect.objectContaining({
				headers: expect.objectContaining({
					Accept: 'application/json',
					Authorization: 'Bearer secret-token'
				})
			})
		)
	})

	it('lists official and community skills when officialOnly is disabled', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					items: [
						{
							name: 'weather',
							family: 'skill',
							isOfficial: false,
							displayName: 'Weather',
							summary: 'Community weather skill',
							latestVersion: '1.0.0'
						},
						{
							name: 'x-search',
							family: 'skill',
							isOfficial: true,
							displayName: 'X Search',
							summary: 'Official search skill',
							latestVersion: '1.1.0'
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
				registryUrl: 'https://clawhub.ai',
				officialOnly: false,
				maxSkills: 25
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
				link: linkBySlug.weather,
				publisher: publishersBySlug.weather,
				description: 'Community weather skill',
				version: '1.0.0',
				stats: statsBySlug.weather,
				tags: ['marketplace', 'clawhub']
			},
			{
				repositoryId: 'repo-1',
				skillId: 'x-search',
				skillPath: 'x-search',
				name: 'X Search',
				link: linkBySlug['x-search'],
				publisher: publishersBySlug['x-search'],
				description: 'Official search skill',
				version: '1.1.0',
				stats: statsBySlug['x-search'],
				tags: ['marketplace', 'clawhub', 'official']
			}
		])

		expect(fetchMock).toHaveBeenCalledTimes(3)
		expect(fetchMock.mock.calls[0][0]).toBe('https://clawhub.ai/api/v1/packages?family=skill&limit=10')
	})

	it('stops pulling more pages after reaching maxSkills', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					items: [
						{
							name: 'weather',
							family: 'skill',
							isOfficial: false,
							displayName: 'Weather',
							summary: 'Community weather skill',
							latestVersion: '1.0.0'
						},
						{
							name: 'calendar',
							family: 'skill',
							isOfficial: false,
							displayName: 'Calendar',
							summary: 'Community calendar skill',
							latestVersion: '1.1.0'
						}
					],
					nextCursor: 'cursor-2'
				}),
				{ status: 200 }
			)
		)

		const result = await provider.listSkills({
			id: 'repo-1',
			provider: CLAWHUB_SKILL_SOURCE_PROVIDER,
			options: {
				registryUrl: 'https://clawhub.ai',
				officialOnly: false,
				maxSkills: 1
			}
		} as any)

		expect(result).toEqual([
			{
				repositoryId: 'repo-1',
				skillId: 'weather',
				skillPath: 'weather',
				name: 'Weather',
				link: linkBySlug.weather,
				publisher: publishersBySlug.weather,
				description: 'Community weather skill',
				version: '1.0.0',
				stats: statsBySlug.weather,
				tags: ['marketplace', 'clawhub']
			}
		])
		expect(fetchMock).toHaveBeenCalledTimes(2)
		expect(fetchMock.mock.calls[0][0]).toBe('https://clawhub.ai/api/v1/packages?family=skill&limit=1')
	})

	it('deduplicates repeated skills across pages by skillId before applying maxSkills', async () => {
		fetchMock
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						items: [
							{
								name: 'weather',
								family: 'skill',
								isOfficial: false,
								displayName: 'Weather',
								summary: 'Community weather skill',
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
								name: 'weather',
								family: 'skill',
								isOfficial: false,
								displayName: 'Weather v2',
								summary: 'Updated weather skill',
								latestVersion: '1.1.0'
							},
							{
								name: 'calendar',
								family: 'skill',
								isOfficial: false,
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
				registryUrl: 'https://clawhub.ai',
				officialOnly: false,
				maxSkills: 2
			}
		} as any)

		expect(result).toEqual([
			{
				repositoryId: 'repo-1',
				skillId: 'weather',
				skillPath: 'weather',
				name: 'Weather v2',
				link: linkBySlug.weather,
				publisher: publishersBySlug.weather,
				description: 'Updated weather skill',
				version: '1.1.0',
				stats: statsBySlug.weather,
				tags: ['marketplace', 'clawhub']
			},
			{
				repositoryId: 'repo-1',
				skillId: 'calendar',
				skillPath: 'calendar',
				name: 'Calendar',
				link: linkBySlug.calendar,
				publisher: publishersBySlug.calendar,
				description: 'Calendar helper',
				version: '2.0.0',
				stats: statsBySlug.calendar,
				tags: ['marketplace', 'clawhub']
			}
		])

		expect(fetchMock).toHaveBeenCalledTimes(4)
		expect(fetchMock.mock.calls[0][0]).toBe('https://clawhub.ai/api/v1/packages?family=skill&limit=2')
		expect(fetchMock.mock.calls[1][0]).toBe('https://clawhub.ai/api/v1/packages?family=skill&limit=1&cursor=cursor-2')
	})

	it('keeps listing skills when public stats enrichment fails', async () => {
		fetchMock
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						items: [
							{
								name: 'weather',
								family: 'skill',
								isOfficial: false,
								displayName: 'Weather',
								summary: 'Community weather skill',
								latestVersion: '1.0.0'
							}
						],
						nextCursor: null
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'error', errorMessage: 'convex down' }), { status: 200 }))

		const result = await provider.listSkills({
			id: 'repo-1',
			provider: CLAWHUB_SKILL_SOURCE_PROVIDER,
			options: {
				registryUrl: 'https://clawhub.ai',
				officialOnly: false
			}
		} as any)

		expect(result).toEqual([
			{
				repositoryId: 'repo-1',
				skillId: 'weather',
				skillPath: 'weather',
				name: 'Weather',
				description: 'Community weather skill',
				version: '1.0.0',
				tags: ['marketplace', 'clawhub']
			}
		])
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
								family: 'skill',
								isOfficial: true,
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
				link: linkBySlug.weather,
				publisher: publishersBySlug.weather,
				description: 'Forecasts',
				version: '1.0.0',
				stats: statsBySlug.weather,
				tags: ['marketplace', 'clawhub', 'official']
			}
		])

		expect(fetchMock).toHaveBeenCalledTimes(3)
		expect(fetchMock.mock.calls[0][0]).toBe('https://clawhub.ai/api/v1/packages?isOfficial=true&limit=10')
		expect(fetchMock.mock.calls[1][0]).toBe('https://clawhub.ai/api/v1/packages?isOfficial=true&limit=10')
	})

	it('falls back to /api/v1/skills when the official package catalog fails', async () => {
		fetchMock
			.mockResolvedValueOnce(new Response('upstream down', { status: 503, statusText: 'Service Unavailable' }))
			.mockResolvedValueOnce(
				new Response('upstream down', { status: 503, statusText: 'Service Unavailable' })
			)
			.mockResolvedValueOnce(
				new Response('upstream down', { status: 503, statusText: 'Service Unavailable' })
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
				link: linkBySlug.weather,
				publisher: publishersBySlug.weather,
				description: 'Forecasts',
				version: '1.0.0',
				stats: statsBySlug.weather,
				tags: ['marketplace', 'clawhub']
			}
		])

		expect(fetchMock).toHaveBeenCalledTimes(5)
		expect(fetchMock.mock.calls[0][0]).toBe('https://clawhub.ai/api/v1/packages?isOfficial=true&limit=10')
		expect(fetchMock.mock.calls[1][0]).toBe('https://clawhub.ai/api/v1/packages?isOfficial=true&limit=10')
		expect(fetchMock.mock.calls[2][0]).toBe('https://clawhub.ai/api/v1/packages?isOfficial=true&limit=10')
		expect(fetchMock.mock.calls[3][0]).toBe('https://clawhub.ai/api/v1/skills?limit=10')
	})

	it('falls back to /api/v1/skills when the skill package catalog fails in community mode', async () => {
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
				registryUrl: 'https://clawhub.ai',
				officialOnly: false
			}
		} as any)

		expect(result).toEqual([
			{
				repositoryId: 'repo-1',
				skillId: 'weather',
				skillPath: 'weather',
				name: 'Weather',
				link: linkBySlug.weather,
				publisher: publishersBySlug.weather,
				description: 'Forecasts',
				version: '1.0.0',
				stats: statsBySlug.weather,
				tags: ['marketplace', 'clawhub']
			}
		])

		expect(fetchMock).toHaveBeenCalledTimes(3)
		expect(fetchMock.mock.calls[0][0]).toBe('https://clawhub.ai/api/v1/packages?family=skill&limit=10')
		expect(fetchMock.mock.calls[1][0]).toBe('https://clawhub.ai/api/v1/skills?limit=10')
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
			.mockResolvedValueOnce(
				new Response('upstream down', { status: 503, statusText: 'Service Unavailable' })
			)
			.mockResolvedValueOnce(
				new Response('upstream down', { status: 503, statusText: 'Service Unavailable' })
			)
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
		expect(fetchMock.mock.calls.every(([url]) => url === 'https://clawhub.ai/api/v1/packages?isOfficial=true&limit=10')).toBe(true)
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

describe('ClawHubSkillSourceProvider live', () => {
	runLiveClawHubTest(
		'lists official skills from ClawHub using the token configured in AI_DEFAULT_SKILL_REPOSITORIES',
		async () => {
			const liveRepository = getClawHubRepositoryFromEnv()

			expect(liveRepository).not.toBeNull()
			if (!liveRepository) {
				throw new Error(
					`Missing clawhub credentials.token in AI_DEFAULT_SKILL_REPOSITORIES. Set ${CLAWHUB_LIVE_TEST_FLAG}=1 only when local env is configured.`
				)
			}

			const provider = new ClawHubSkillSourceProvider()
			const result = await provider.listSkills({
				id: 'repo-live',
				provider: CLAWHUB_SKILL_SOURCE_PROVIDER,
				options: {
					registryUrl: liveRepository.registryUrl
				},
				credentials: {
					token: liveRepository.token
				}
			} as any)

			if (!result.length) {
				throw new Error(
					`ClawHub returned an empty skill list for '${liveRepository.registryUrl}'. The repository token was loaded from AI_DEFAULT_SKILL_REPOSITORIES, but no skills were listed.`
				)
			}

			expect(result[0]).toEqual(
				expect.objectContaining({
						repositoryId: 'repo-live',
						skillId: expect.any(String),
						skillPath: expect.any(String),
						name: expect.any(String),
						link: expect.stringMatching(/^https:\/\/clawhub\.ai\/[^/]+\/[^/]+$/),
						publisher: expect.objectContaining({
							handle: expect.any(String)
					}),
					stats: expect.objectContaining({
						downloads: expect.any(Number),
						stars: expect.any(Number)
					})
				})
			)
			expect(result.every((item) => item.tags.includes('clawhub'))).toBe(true)
		},
		30_000
	)
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
