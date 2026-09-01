import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { TXpertProjectSkillFile, TXpertProjectSkills } from '@xpert-ai/contracts'
import { SkillSourceProviderRegistry } from '@xpert-ai/plugin-sdk'
import { InjectRepository } from '@nestjs/typeorm'
import { lstat, mkdtemp, open, readdir, realpath, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { Repository } from 'typeorm'
import { t } from 'i18next'
import { getErrorMessage } from '@xpert-ai/server-common'
import {
    assertProjectContentRootIntegrity,
    findValidatedProjectSkillFiles,
    isProjectGovernedContentPath,
    ProjectContentIntegrityError,
    PROJECT_SKILL_MANIFEST_PATH,
    ProjectSkillManifest,
    ProjectSkillManifestEntry,
    normalizeProjectSkillId,
    readProjectSkillManifest,
    VOLUME_CLIENT,
    VolumeClient,
    VolumeHandle
} from '../../shared/volume'
import { SkillRepositoryIndexService } from '../../skill-repository/repository-index/skill-repository-index.service'
import {
    cleanupExtractedSkillArchive,
    extractSkillsFromZip,
    installUploadedSkills,
    IUploadedSkill
} from '../../skill-repository/plugins/zip/archive'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectAccessService } from './project-access.service'

@Injectable()
export class XpertProjectContentService {
    constructor(
        @Inject(VOLUME_CLIENT) private readonly volumeClient: VolumeClient,
        private readonly accessService: XpertProjectAccessService,
        private readonly skillIndexService: SkillRepositoryIndexService,
        private readonly skillSourceProviderRegistry: SkillSourceProviderRegistry,
        @InjectRepository(XpertProject) private readonly projectRepository?: Repository<XpertProject>
    ) {}

    static isGovernedPath(filePath: string) {
        return isProjectGovernedContentPath(filePath)
    }

    async initialize(project: XpertProject) {
        const volume = await this.projectVolume(project).ensureRoot()
        await Promise.all([
            VolumeHandle.ensureDirectory(volume.serverRoot, 'skills'),
            VolumeHandle.ensureDirectory(volume.serverRoot, 'shared')
        ])
        const file = await open(volume.path('project.md'), 'wx', 0o600).catch((error: unknown) => {
            if (isNodeError(error) && error.code === 'EEXIST') return null
            throw error
        })
        if (file) {
            try {
                await file.writeFile(project.settings?.instruction ?? '', { encoding: 'utf8' })
            } finally {
                await file.close()
            }
        }
        await this.assertContentRootIntegrity(volume.serverRoot)
        return volume
    }

    async readInstructions(projectId: string) {
        const { project } = await this.accessService.assertCanRead(projectId)
        const volume = await this.initialize(project)
        return { content: await volume.readFile('project.md') }
    }

    async readRuntimeInstructions(projectId: string) {
        return (await this.readInstructions(projectId)).content
    }

    async updateInstructions(projectId: string, content: string) {
        const { project } = await this.accessService.assertCanEdit(projectId)
        const volume = await this.initialize(project)
        await VolumeHandle.writeFile(volume.serverRoot, 'project.md', content ?? '', { encoding: 'utf8' })
        return { content: content ?? '' }
    }

    async listSkills(projectId: string): Promise<TXpertProjectSkills> {
        const { project } = await this.accessService.assertCanRead(projectId)
        const volume = await this.initialize(project)
        const skillsRoot = await realpath(volume.path('skills'))
        const manifest = await readProjectSkillManifest(volume.serverRoot)
        const manifestById = new Map(manifest.items.map((item) => [item.id, item]))
        const items = (await this.findSkillFiles(volume.serverRoot))
            .map((skillMdPath) => {
                const relativePath = path.relative(skillsRoot, skillMdPath).replace(/\\/g, '/')
                const id = path.posix.dirname(relativePath)
                const installed = manifestById.get(id)
                return {
                    id,
                    name: installed?.name ?? path.posix.basename(id),
                    path: `skills/${relativePath}`,
                    enabled: installed?.enabled ?? true,
                    source: installed?.source ?? ('legacy' as const),
                    ...(installed?.description ? { description: installed.description } : {}),
                    ...(installed?.version ? { version: installed.version } : {})
                }
            })
            .sort((left, right) => left.path.localeCompare(right.path))
        return { items, total: items.length }
    }

    async installSkill(projectId: string, indexId: string) {
        const { project } = await this.accessService.assertCanEdit(projectId)
        const normalizedIndexId = indexId?.trim()
        if (!normalizedIndexId) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectSkillIndexRequired', {
                    defaultValue: 'Select a skill from a repository to install'
                })
            )
        }
        const volume = await this.initialize(project)
        const index = await this.skillIndexService.findOneInOrganizationOrTenant(normalizedIndexId, {
            relations: ['repository']
        })
        if (!index.repository) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectSkillRepositoryUnavailable', {
                    defaultValue: 'The selected skill repository is unavailable'
                })
            )
        }

        let stagingRoot: string | null = null
        try {
            stagingRoot = await mkdtemp(path.join(tmpdir(), 'project-skill-install-'))
            const provider = this.skillSourceProviderRegistry.get(index.repository.provider)
            const installedPath = await provider.installSkillPackage(index, stagingRoot)
            const id = normalizeInstalledProjectSkillId(stagingRoot, installedPath)
            await copyStagedProjectSkill(volume, stagingRoot, installedPath, id)
            await this.assertInstalledSkillExists(volume.serverRoot, id)
            const entry: ProjectSkillManifestEntry = {
                id,
                name: index.name?.trim() || path.posix.basename(id),
                enabled: true,
                source: 'repository',
                skillIndexId: normalizedIndexId,
                provider: index.repository.provider,
                ...(index.description?.trim() ? { description: index.description.trim() } : {}),
                ...(index.version?.trim() ? { version: index.version.trim() } : {})
            }
            await this.upsertManifestEntries(volume, [entry])
            return projectSkillSummary(entry)
        } catch (error) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectSkillInstallFailed', {
                    defaultValue: 'Failed to install the Project skill: {{message}}',
                    message: getErrorMessage(error)
                })
            )
        } finally {
            if (stagingRoot) await rm(stagingRoot, { recursive: true, force: true })
        }
    }

    async uploadSkills(projectId: string, file: Express.Multer.File) {
        const { project } = await this.accessService.assertCanEdit(projectId)
        if (!file?.buffer?.length) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectSkillArchiveRequired', {
                    defaultValue: 'Select a valid skill package archive'
                })
            )
        }
        const volume = await this.initialize(project)
        let tempDir: string | null = null
        try {
            const extracted = await extractSkillsFromZip(file.buffer)
            tempDir = extracted.tempDir
            if (!extracted.skills.length) {
                throw new BadRequestException(
                    t('server-ai:Error.ProjectSkillArchiveEmpty', {
                        defaultValue: 'No skills were found in the uploaded archive'
                    })
                )
            }
            const skillsRoot = await realpath(volume.path('skills'))
            const installable = extracted.skills.map(normalizeUploadedProjectSkill)
            const installed = await installUploadedSkills(installable, skillsRoot)
            const entries = installed.map<ProjectSkillManifestEntry>((skill) => ({
                id: normalizeProjectSkillId(skill.skillPath),
                name: skill.name,
                enabled: true,
                source: 'upload',
                ...(skill.description?.trim() ? { description: skill.description.trim() } : {}),
                ...(skill.version?.trim() ? { version: skill.version.trim() } : {})
            }))
            for (const entry of entries) await this.assertInstalledSkillExists(volume.serverRoot, entry.id)
            await this.upsertManifestEntries(volume, entries)
            return entries.map(projectSkillSummary)
        } catch (error) {
            if (error instanceof BadRequestException) throw error
            throw new BadRequestException(
                t('server-ai:Error.ProjectSkillUploadFailed', {
                    defaultValue: 'Failed to upload the Project skill package: {{message}}',
                    message: getErrorMessage(error)
                })
            )
        } finally {
            if (tempDir) await cleanupExtractedSkillArchive(tempDir)
        }
    }

    async setSkillEnabled(projectId: string, skillId: string, enabled: boolean) {
        const { project } = await this.accessService.assertCanEdit(projectId)
        const volume = await this.initialize(project)
        const id = normalizeProjectSkillId(skillId)
        const skills = await this.listSkills(projectId)
        const current = skills.items.find((item) => item.id === id)
        if (!current) throwProjectSkillNotFound()
        const manifest = await readProjectSkillManifest(volume.serverRoot)
        const persisted = manifest.items.find((item) => item.id === id)
        await this.upsertManifestEntries(volume, [
            {
                id,
                name: persisted?.name ?? current.name,
                enabled,
                source: persisted?.source ?? current.source,
                ...(persisted?.description ? { description: persisted.description } : {}),
                ...(persisted?.version ? { version: persisted.version } : {}),
                ...(persisted?.skillIndexId ? { skillIndexId: persisted.skillIndexId } : {}),
                ...(persisted?.provider ? { provider: persisted.provider } : {})
            }
        ])
        return { ...current, enabled }
    }

    async uninstallSkill(projectId: string, skillId: string) {
        const { project } = await this.accessService.assertCanEdit(projectId)
        const volume = await this.initialize(project)
        const id = normalizeProjectSkillId(skillId)
        const skills = await this.listSkills(projectId)
        if (!skills.items.some((item) => item.id === id)) throwProjectSkillNotFound()
        await volume.deleteFile(`skills/${id}`)
        const manifest = await readProjectSkillManifest(volume.serverRoot)
        await this.writeManifest(volume, {
            version: 1,
            items: manifest.items.filter((item) => item.id !== id)
        })
    }

    async readSkillFile(projectId: string, filePath: string): Promise<TXpertProjectSkillFile> {
        const { project } = await this.accessService.assertCanRead(projectId)
        const volume = await this.initialize(project)
        await this.findSkillFiles(volume.serverRoot)
        const normalizedPath = normalizeProjectSkillContentPath(filePath)
        return { path: normalizedPath, content: await volume.readFile(normalizedPath) }
    }

    async writeSkillFile(projectId: string, filePath: string, content: string): Promise<TXpertProjectSkillFile> {
        const { project } = await this.accessService.assertCanEdit(projectId)
        const volume = await this.initialize(project)
        await this.findSkillFiles(volume.serverRoot)
        const normalizedPath = normalizeProjectSkillContentPath(filePath)
        await VolumeHandle.writeFile(volume.serverRoot, normalizedPath, content ?? '', { encoding: 'utf8' })
        return { path: normalizedPath, content: content ?? '' }
    }

    async deleteSkillPath(projectId: string, filePath: string) {
        const { project } = await this.accessService.assertCanEdit(projectId)
        const volume = await this.initialize(project)
        await this.findSkillFiles(volume.serverRoot)
        await volume.deleteFile(normalizeProjectSkillContentPath(filePath))
    }

    async initializeById(projectId: string) {
        const project = await this.projectRepository?.findOne({ where: { id: projectId } })
        if (project) await this.initialize(project)
    }

    private projectVolume(project: XpertProject) {
        return this.volumeClient.resolve({
            tenantId: project.tenantId,
            userId: project.ownerId,
            catalog: 'projects',
            projectId: project.id
        })
    }

    private async assertContentRootIntegrity(volumeRoot: string) {
        try {
            await assertProjectContentRootIntegrity(volumeRoot)
        } catch (error) {
            if (error instanceof ProjectContentIntegrityError) {
                throw new BadRequestException(error.message)
            }
            throw error
        }
    }

    private async findSkillFiles(volumeRoot: string) {
        try {
            return await findValidatedProjectSkillFiles(volumeRoot)
        } catch (error) {
            if (error instanceof ProjectContentIntegrityError) {
                throw new BadRequestException(error.message)
            }
            throw error
        }
    }

    private async assertInstalledSkillExists(volumeRoot: string, skillId: string) {
        const skillsRoot = await realpath(path.join(volumeRoot, 'skills'))
        const matches = (await this.findSkillFiles(volumeRoot)).some(
            (skillFile) => path.relative(skillsRoot, path.dirname(skillFile)).replace(/\\/g, '/') === skillId
        )
        if (!matches) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectSkillPackageInvalid', {
                    defaultValue: 'The installed package does not contain a valid SKILL.md file'
                })
            )
        }
    }

    private async upsertManifestEntries(volume: VolumeHandle, entries: ProjectSkillManifestEntry[]) {
        const manifest = await readProjectSkillManifest(volume.serverRoot).catch((error) => {
            if (error instanceof ProjectContentIntegrityError) throw new BadRequestException(error.message)
            throw error
        })
        const byId = new Map(manifest.items.map((item) => [item.id, item]))
        for (const entry of entries) byId.set(entry.id, entry)
        await this.writeManifest(volume, { version: 1, items: [...byId.values()] })
    }

    private writeManifest(volume: VolumeHandle, manifest: ProjectSkillManifest) {
        return VolumeHandle.writeFile(
            volume.serverRoot,
            PROJECT_SKILL_MANIFEST_PATH,
            JSON.stringify(manifest, null, 2),
            {
                encoding: 'utf8'
            }
        )
    }
}

function projectSkillSummary(entry: ProjectSkillManifestEntry) {
    return {
        id: entry.id,
        name: entry.name,
        path: `skills/${entry.id}/SKILL.md`,
        enabled: entry.enabled,
        source: entry.source,
        ...(entry.description ? { description: entry.description } : {}),
        ...(entry.version ? { version: entry.version } : {})
    }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return typeof error === 'object' && error !== null && 'code' in error
}

function normalizeProjectSkillContentPath(filePath: string) {
    const normalized = path.posix.normalize(filePath?.replace(/\\/g, '/').replace(/^\/+/, '') ?? '')
    if (
        !normalized.startsWith('skills/') ||
        normalized === 'skills/' ||
        normalized === 'skills/..' ||
        normalized === PROJECT_SKILL_MANIFEST_PATH
    ) {
        throw new BadRequestException(
            t('server-ai:Error.ProjectSkillPathInvalid', {
                defaultValue: 'Project skill path must be inside the skills directory'
            })
        )
    }
    return normalized
}

function normalizeInstalledProjectSkillId(skillsRoot: string, installedPath: string) {
    const candidate = path.resolve(skillsRoot, installedPath)
    const relativePath = path.relative(skillsRoot, candidate).replace(/\\/g, '/')
    return normalizeProjectSkillId(relativePath)
}

async function copyStagedProjectSkill(
    volume: VolumeHandle,
    stagingRoot: string,
    installedPath: string,
    skillId: string
) {
    const canonicalStagingRoot = await realpath(stagingRoot)
    const sourceRoot = await realpath(path.resolve(stagingRoot, installedPath))
    assertPathInside(canonicalStagingRoot, sourceRoot)
    const sourceStat = await lstat(sourceRoot)
    if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) {
        throw new ProjectContentIntegrityError(`skills/${skillId}`, 'invalid_package_root')
    }

    const entries = await collectStagedSkillEntries(canonicalStagingRoot, sourceRoot, '')
    if (!entries.some((entry) => entry.type === 'file' && entry.relativePath === 'SKILL.md')) {
        throw new ProjectContentIntegrityError(`skills/${skillId}/SKILL.md`, 'missing_skill_file')
    }

    const targetRoot = `skills/${skillId}`
    await VolumeHandle.removePath(volume.serverRoot, targetRoot, { boundaryRoot: volume.serverRoot }).catch(
        (error: unknown) => {
            if (!isNodeError(error) || error.code !== 'ENOENT') throw error
        }
    )
    await VolumeHandle.ensureDirectory(volume.serverRoot, targetRoot, volume.serverRoot)
    for (const entry of entries) {
        const targetPath = path.posix.join(targetRoot, entry.relativePath)
        if (entry.type === 'directory') {
            await VolumeHandle.ensureDirectory(volume.serverRoot, targetPath, volume.serverRoot)
        } else {
            const opened = await open(entry.absolutePath, 'r')
            try {
                const fileStat = await opened.stat()
                if (!fileStat.isFile() || fileStat.nlink !== 1) {
                    throw new ProjectContentIntegrityError(`skills/${skillId}/${entry.relativePath}`, 'invalid_file')
                }
                await VolumeHandle.writeFile(volume.serverRoot, targetPath, await opened.readFile(), {
                    boundaryRoot: volume.serverRoot
                })
            } finally {
                await opened.close()
            }
        }
    }
}

type StagedSkillEntry = {
    type: 'directory' | 'file'
    relativePath: string
    absolutePath: string
}

async function collectStagedSkillEntries(
    stagingRoot: string,
    currentRoot: string,
    relativeRoot: string
): Promise<StagedSkillEntry[]> {
    const entries: StagedSkillEntry[] = []
    for (const entry of await readdir(currentRoot, { withFileTypes: true })) {
        const relativePath = path.posix.join(relativeRoot, entry.name)
        const absolutePath = path.join(currentRoot, entry.name)
        if (entry.isSymbolicLink()) {
            throw new ProjectContentIntegrityError(`skills/${relativePath}`, 'symbolic_link')
        }
        const canonicalPath = await realpath(absolutePath)
        assertPathInside(stagingRoot, canonicalPath)
        if (entry.isDirectory()) {
            entries.push({ type: 'directory', relativePath, absolutePath: canonicalPath })
            entries.push(...(await collectStagedSkillEntries(stagingRoot, canonicalPath, relativePath)))
        } else if (entry.isFile()) {
            const fileStat = await lstat(canonicalPath)
            if (fileStat.nlink !== 1) {
                throw new ProjectContentIntegrityError(`skills/${relativePath}`, 'multiple_hard_links')
            }
            entries.push({ type: 'file', relativePath, absolutePath: canonicalPath })
        } else {
            throw new ProjectContentIntegrityError(`skills/${relativePath}`, 'unsupported_entry')
        }
    }
    return entries
}

function assertPathInside(root: string, candidate: string) {
    const relativePath = path.relative(root, candidate)
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new ProjectContentIntegrityError(candidate, 'path_escape')
    }
}

function normalizeUploadedProjectSkill(skill: IUploadedSkill): IUploadedSkill {
    const skillPath = skill.skillPath?.trim() || slugProjectSkillName(skill.name)
    return { ...skill, skillPath: normalizeProjectSkillId(skillPath) }
}

function slugProjectSkillName(value: string) {
    const slug = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
    return slug || `skill-${Date.now()}`
}

function throwProjectSkillNotFound(): never {
    throw new BadRequestException(
        t('server-ai:Error.ProjectSkillNotFound', { defaultValue: 'The requested Project skill was not found' })
    )
}
