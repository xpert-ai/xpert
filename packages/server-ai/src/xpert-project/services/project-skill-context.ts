// Stable execution inputs, not a security boundary against the Computer/workspace owner.
import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { z } from 'zod/v3'
import type { TXpertProjectSkills } from '@xpert-ai/contracts'
import { VolumeHandle } from '../../shared/volume'
import { ProjectContentIntegrityError } from '../../shared/volume/project-content-integrity'
import { normalizeProjectSkillId } from '../../shared/volume/project-skill-manifest'
import { withWorkspaceLock } from '../../shared/volume/workspace-storage-lock'

export type ProjectSkillContextReceipt = { path: string; sha256: string }
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const fileSchema = z.object({ path: z.string(), sha256: digest })
const contextSchema = z.object({
    version: z.literal(1),
    projectId: z.string(),
    invocationId: z.string().uuid(),
    instructions: fileSchema,
    skills: z.array(
        z
            .object({ path: z.string(), files: z.array(fileSchema), sha256: digest, packageSha256: digest.optional() })
            .passthrough()
    )
})
type ContextFile = z.infer<typeof fileSchema>

export async function prepareProjectSkillContext(
    volume: VolumeHandle,
    projectId: string,
    invocationId: string,
    installed: TXpertProjectSkills
): Promise<ProjectSkillContextReceipt> {
    z.string().uuid().parse(invocationId)
    const root = `.xpert/task-contexts/${invocationId}`
    await VolumeHandle.ensureDirectory(volume.serverRoot, root, volume.serverRoot)
    return withWorkspaceLock(
        volume.path(`${root}/prepare`),
        async () => {
            const manifestPath = `${root}/context.json`
            let count = 0,
                bytes = 0
            const read = async (path: string) => {
                const opened = await VolumeHandle.openFileSnapshot(volume.serverRoot, path, { followSymlink: false })
                try {
                    bytes += opened.fileStat.size
                    if (!opened.fileStat.isFile() || opened.fileStat.nlink !== 1 || opened.volumeRelativePath !== path)
                        throw new ProjectContentIntegrityError(path, 'invalid_skill_file')
                    if (++count > 10001 || opened.fileStat.size > 10 * 1024 * 1024 || bytes > 128 * 1024 * 1024)
                        throw new ProjectContentIntegrityError(path, 'skill_context_limit')
                    return await opened.fileHandle.readFile()
                } finally {
                    await opened.fileHandle.close()
                }
            }
            // Replayed starts retain and verify the completed copy, even after its source is removed.
            let existing: Buffer | undefined
            try {
                existing = await read(manifestPath)
            } catch (error) {
                if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error
            }
            if (existing) {
                const context = contextSchema.parse(JSON.parse(existing.toString('utf8')))
                if (context.projectId !== projectId || context.invocationId !== invocationId)
                    throw new ProjectContentIntegrityError(manifestPath, 'context_identity')
                for (const file of [context.instructions, ...context.skills.flatMap((skill) => skill.files)]) {
                    if (
                        !file.path.startsWith(`${root}/`) ||
                        file.path.split('/').includes('..') ||
                        hash(await read(file.path)) !== file.sha256
                    )
                        throw new ProjectContentIntegrityError(file.path, 'context_changed')
                }
                return { path: manifestPath, sha256: hash(existing) }
            }
            const sources: ContextFile[] = []
            const directories: Array<{ path: string; entries: string }> = []
            const entriesOf = async (source: string) => {
                const directory = await VolumeHandle.openExistingFile(volume.serverRoot, source, {
                    boundaryRoot: volume.serverRoot
                })
                try {
                    if (!directory.fileStat.isDirectory() || directory.volumeRelativePath !== source)
                        throw new ProjectContentIntegrityError(source, 'invalid_skill_directory')
                    const entries = (await readdir(directory.descriptorPath, { withFileTypes: true })).sort((a, b) =>
                        a.name.localeCompare(b.name)
                    )
                    if (entries.some((entry) => entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())))
                        throw new ProjectContentIntegrityError(source, 'unsupported_skill_entry')
                    return entries
                } finally {
                    await directory.fileHandle.close()
                }
            }
            const directoryDigest = (entries: Awaited<ReturnType<typeof entriesOf>>) =>
                JSON.stringify(entries.map((e) => [e.name, e.isDirectory()]))
            const copyTree = async (source: string, target: string): Promise<ContextFile[]> => {
                const entries = await entriesOf(source)
                directories.push({ path: source, entries: directoryDigest(entries) })
                await VolumeHandle.ensureDirectory(volume.serverRoot, target, volume.serverRoot)
                const files: ContextFile[] = []
                for (const entry of entries) {
                    const from = `${source}/${entry.name}`,
                        to = `${target}/${entry.name}`
                    if (entry.isDirectory()) files.push(...(await copyTree(from, to)))
                    else {
                        const content = await read(from),
                            sha256 = hash(content)
                        await volume.writeFile(to, content)
                        sources.push({ path: from, sha256 })
                        files.push({ path: to, sha256 })
                    }
                }
                return files
            }
            const instructions = await read('project.md')
            sources.push({ path: 'project.md', sha256: hash(instructions) })
            await volume.writeFile(`${root}/project.md`, instructions)
            const skills = []
            for (const skill of installed.items.filter((item) => item.enabled)) {
                const source = `skills/${normalizeProjectSkillId(skill.id)}`
                if (skill.path !== `${source}/SKILL.md`)
                    throw new ProjectContentIntegrityError(skill.path, 'invalid_skill_path')
                const target = `${root}/${source}`
                const files = await copyTree(source, target)
                const entry = files.find((file) => file.path === `${target}/SKILL.md`)
                if (!entry) throw new ProjectContentIntegrityError(skill.path, 'missing_skill_file')
                skills.push({
                    ...skill,
                    path: entry.path,
                    sha256: entry.sha256,
                    packageSha256: hash(JSON.stringify(files)),
                    files
                })
            }
            // Detect edits or package replacement while preparing; do not dispatch mixed generations.
            for (const directory of directories) {
                if (directoryDigest(await entriesOf(directory.path)) !== directory.entries)
                    throw new ProjectContentIntegrityError(directory.path, 'source_changed')
            }
            for (const file of sources) {
                if (hash(await read(file.path)) !== file.sha256)
                    throw new ProjectContentIntegrityError(file.path, 'source_changed')
            }
            const manifest = JSON.stringify(
                {
                    version: 1,
                    projectId,
                    invocationId,
                    instructions: { path: `${root}/project.md`, sha256: hash(instructions) },
                    skills,
                    guidance:
                        'Paths are relative to the original Project directory. Each path/sha256 pair describes that file; a skill packageSha256 hashes the JSON files array, not SKILL.md. Read this task copy first. Assistant coordination skills and other Projects are not implicit task dependencies. Missing program knowledge must be requested from the coordinator, not replaced with historical project instructions.'
                },
                null,
                2
            )
            await volume.writeFile(manifestPath, manifest)
            return { path: manifestPath, sha256: hash(manifest) }
        },
        5000
    )
}
