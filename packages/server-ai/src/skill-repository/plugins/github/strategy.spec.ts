import * as tar from 'tar'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	SkillSourceProviderStrategy: () => () => undefined
}))

import { scanGithubSkills } from './strategy'

describe('scanGithubSkills', () => {
	const tempDirs: string[] = []

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
	})

	it('adds publisher, link and repo stars from GitHub metadata', async () => {
		const tempDir = await mkdtemp(join(tmpdir(), 'github-skill-spec-'))
		tempDirs.push(tempDir)

		const repoRoot = join(tempDir, 'skills-repo')
		await mkdir(join(repoRoot, 'packages', 'skills', 'weather'), { recursive: true })
		await writeFile(
			join(repoRoot, 'packages', 'skills', 'weather', 'SKILL.md'),
			[
				'---',
				'name: Weather Skill',
				'description: Forecast helper',
				'license: MIT',
				'version: 1.2.3',
				'---',
				'',
				'# Weather Skill'
			].join('\n')
		)

		const tarballPath = join(tempDir, 'skills-repo.tar.gz')
		await tar.c({ gzip: true, file: tarballPath, cwd: tempDir }, ['skills-repo'])
		const tarball = await readFile(tarballPath)

		const queue = {
			add: jest.fn(async (_name: string, job: { url: string }) => ({
				finished: async () => {
					switch (job.url) {
						case 'https://api.github.com/repos/acme/skills-repo':
							return {
								ok: true,
								status: 200,
								statusText: 'OK',
								headers: {},
								data: {
									default_branch: 'develop',
									stargazers_count: 42,
									owner: {
										login: 'acme',
										avatar_url: 'https://example.com/acme.png',
										type: 'Organization'
									}
								}
							}
						case 'https://api.github.com/users/acme':
							return {
								ok: true,
								status: 200,
								statusText: 'OK',
								headers: {},
								data: {
									login: 'acme',
									name: 'Acme Org',
									avatar_url: 'https://example.com/acme.png',
									type: 'Organization'
								}
							}
						case 'https://api.github.com/repos/acme/skills-repo/tarball/develop':
							return {
								ok: true,
								status: 200,
								statusText: 'OK',
								headers: {},
								data: tarball
							}
						default:
							throw new Error(`Unexpected queue request: ${job.url}`)
					}
				}
			}))
		}

		const result = await scanGithubSkills(
			queue as any,
			'https://github.com/acme/skills-repo',
			'repo-1',
			{
				options: {
					url: 'https://github.com/acme/skills-repo',
					path: 'packages/skills'
				}
			} as any
		)

		expect(result).toEqual([
			expect.objectContaining({
				repositoryId: 'repo-1',
				skillPath: 'weather',
				skillId: 'weather',
				name: 'Weather Skill',
				link: 'https://github.com/acme/skills-repo/blob/develop/packages/skills/weather/SKILL.md',
				publisher: {
					handle: 'acme',
					displayName: 'Acme Org',
					name: 'Acme Org',
					image: 'https://example.com/acme.png',
					kind: 'organization'
				},
				description: 'Forecast helper',
				license: 'MIT',
				tags: [],
				version: '1.2.3',
				stats: {
					stars: 42
				}
			})
		])
		expect(queue.add).toHaveBeenCalledTimes(3)
	})
})
