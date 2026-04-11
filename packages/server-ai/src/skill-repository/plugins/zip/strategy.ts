import { ISkillRepository, ISkillRepositoryIndex, TSkillSourceMeta } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { ISkillSourceProvider, SkillSourceProviderStrategy } from '@xpert-ai/plugin-sdk'
import { cp, mkdtemp, mkdir, readdir, rm, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, relative } from 'path'
import unzipper from 'unzipper'

export const FILE_SKILL_SOURCE_PROVIDER = 'file'
const SKILL_FILE_NAME = 'SKILL.md'

export interface IUploadedSkill {
	skillPath: string
	name: string
	description?: string
	license?: string
	tags?: string[]
	version?: string
	resources?: any[]
	absolutePath: string
}

@Injectable()
@SkillSourceProviderStrategy(FILE_SKILL_SOURCE_PROVIDER)
export class ZipSkillSourceProvider implements ISkillSourceProvider {
	readonly type = 'file'
	readonly meta: TSkillSourceMeta = {
		name: FILE_SKILL_SOURCE_PROVIDER,
		label: {
			en_US: 'Upload Zip',
			zh_Hans: '上传 Zip'
		},
		icon: { type: 'svg', value: 'Upload' },
		configSchema: {
			type: 'object',
			properties: {}
		},
		credentialSchema: {
			type: 'object',
			properties: {}
		}
	}

	canHandle(sourceType: string): boolean {
		return sourceType === FILE_SKILL_SOURCE_PROVIDER || sourceType === 'zip'
	}

	async listSkills(_: ISkillRepository): Promise<ISkillRepositoryIndex[]> {
		return []
	}

	async installSkillPackage(): Promise<string> {
		throw new Error('File upload installs skills directly without repository index')
	}

	/**
	 * Extract skills from a zip buffer and copy them into installDir.
	 */
	async installFromZip(buffer: Buffer, installDir: string): Promise<IUploadedSkill[]> {
		const { tempDir, skillsRoot } = await this.extractZip(buffer)
		try {
			const skills: IUploadedSkill[] = []
			await this.scanDirectory(skills, skillsRoot, '')
			await mkdir(installDir, { recursive: true })

			for (const skill of skills) {
				const normalizedSkillPath = this.normalizeSkillPath(skill.skillPath || skill.name)
				const targetPath = join(installDir, normalizedSkillPath)
				await cp(skill.absolutePath, targetPath, { recursive: true })
				skill.skillPath = normalizedSkillPath
				// Record absolute path for later use
				skill.absolutePath = join(targetPath, SKILL_FILE_NAME)
			}

			return skills
		} finally {
			await rm(tempDir, { recursive: true, force: true })
		}
	}

	private async extractZip(buffer: Buffer) {
		const tempDir = await mkdtemp(join(tmpdir(), 'skill-file-'))
		const zipPath = join(tempDir, 'upload.zip')
		await writeFile(zipPath, buffer)

		const archive = await unzipper.Open.buffer(buffer)
		await archive.extract({ path: tempDir })

		const entries = await readdir(tempDir, { withFileTypes: true })
		const rootDir = entries.length === 1 && entries[0].isDirectory() ? join(tempDir, entries[0].name) : tempDir

		return { tempDir, skillsRoot: rootDir }
	}

	private async scanDirectory(list: IUploadedSkill[], skillsRoot: string, name: string) {
		const absDir = join(skillsRoot, name || '')
		const entries = await readdir(absDir, { withFileTypes: true })
		const hasSkillMd = entries.some(
			(entry) => entry.isFile() && entry.name.toLowerCase() === SKILL_FILE_NAME.toLowerCase()
		)

		if (hasSkillMd) {
			const relDir = relative(skillsRoot, absDir) || ''
			const normalizedSkillPath = this.normalizeSkillPath(relDir)
			const metadata = await this.resolveSkillMetadataFromFs(join(absDir, SKILL_FILE_NAME))
			const resources = await this.collectResourcesFromFs(skillsRoot, absDir, [])

			list.push({
				skillPath: normalizedSkillPath,
				name: metadata?.name || normalizedSkillPath.split('/').pop() || normalizedSkillPath || 'skill',
				description: metadata?.description,
				license: metadata?.license,
				tags: [],
				version: metadata?.version,
				resources,
				absolutePath: absDir
			})

			return
		}

		for (const entry of entries) {
			if (entry.isDirectory()) {
				await this.scanDirectory(list, skillsRoot, join(name, entry.name))
			}
		}
	}

	private normalizeSkillPath(value: string): string {
		const unixPath = value
			.replace(/\\/g, '/')
			.replace(/^\/+/, '')
			.replace(/^\.\/+/, '')
		return unixPath.replace(/^(skills\/)+/, '')
	}

	private async resolveSkillMetadataFromFs(skillMdPath: string) {
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

	private async collectResourcesFromFs(skillsRoot: string, absDir: string, list: any[] = []): Promise<any[]> {
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
				await this.collectResourcesFromFs(skillsRoot, absPath, list)
			}
		}
		return list
	}

	async uninstallSkillPackage(path: string) {
		if (!path) {
			return
		}
		await rm(path, { recursive: true, force: true })
	}
}
