import { cp, mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, relative } from 'path'
import unzipper from 'unzipper'

export const SKILL_FILE_NAME = 'SKILL.md'

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

export async function extractSkillsFromZip(buffer: Buffer): Promise<{
	skills: IUploadedSkill[]
	skillsRoot: string
	tempDir: string
}> {
	const tempDir = await mkdtemp(join(tmpdir(), 'skill-file-'))
	const zipPath = join(tempDir, 'upload.zip')
	await writeFile(zipPath, buffer)

	const archive = await unzipper.Open.buffer(buffer)
	await archive.extract({ path: tempDir })

	const entries = await readdir(tempDir, { withFileTypes: true })
	const rootDir = entries.length === 1 && entries[0].isDirectory() ? join(tempDir, entries[0].name) : tempDir
	const skills: IUploadedSkill[] = []
	await scanSkillDirectory(skills, rootDir, '')

	return {
		skills,
		skillsRoot: rootDir,
		tempDir
	}
}

export async function installUploadedSkills(skills: IUploadedSkill[], installDir: string): Promise<IUploadedSkill[]> {
	await mkdir(installDir, { recursive: true })

	const installedSkills: IUploadedSkill[] = []
	for (const skill of skills) {
		const normalizedSkillPath = normalizeUploadedSkillPath(skill.skillPath || skill.name)
		const targetPath = join(installDir, normalizedSkillPath)
		await cp(skill.absolutePath, targetPath, { recursive: true })

		installedSkills.push({
			...skill,
			skillPath: normalizedSkillPath,
			absolutePath: join(targetPath, SKILL_FILE_NAME)
		})
	}

	return installedSkills
}

export async function cleanupExtractedSkillArchive(tempDir: string) {
	if (!tempDir) {
		return
	}

	await rm(tempDir, { recursive: true, force: true })
}

export function normalizeUploadedSkillPath(value: string): string {
	const unixPath = value
		.replace(/\\/g, '/')
		.replace(/^\/+/, '')
		.replace(/^\.\/+/, '')

	return unixPath.replace(/^(skills\/)+/, '')
}

async function scanSkillDirectory(list: IUploadedSkill[], skillsRoot: string, name: string) {
	const absDir = join(skillsRoot, name || '')
	const entries = await readdir(absDir, { withFileTypes: true })
	const hasSkillMd = entries.some(
		(entry) => entry.isFile() && entry.name.toLowerCase() === SKILL_FILE_NAME.toLowerCase()
	)

	if (hasSkillMd) {
		const relDir = relative(skillsRoot, absDir) || ''
		const normalizedSkillPath = normalizeUploadedSkillPath(relDir)
		const metadata = await resolveSkillMetadataFromFs(join(absDir, SKILL_FILE_NAME))
		const resources = await collectResourcesFromFs(skillsRoot, absDir, [])

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
			await scanSkillDirectory(list, skillsRoot, join(name, entry.name))
		}
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
