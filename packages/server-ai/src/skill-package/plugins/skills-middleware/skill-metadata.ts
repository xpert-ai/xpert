import { Inject, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ISkillRepositoryIndex, parseRuntimeSkillCapabilityId, TRuntimeSkillSource } from '@xpert-ai/contracts'
import { IAgentMiddlewareContext, SandboxBackendProtocol, resolveSandboxBackend } from '@xpert-ai/plugin-sdk'
import { access, readFile, stat } from 'fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import { In, Repository } from 'typeorm'
import { z } from 'zod/v3'
import { t } from 'i18next'
import { SkillPackage } from '../../skill-package.entity'
import { XpertWorkspaceAccessService } from '../../../xpert-workspace'
import { SandboxAcquireBackendCommand } from '../../../sandbox'
import {
    findValidatedProjectSkillFiles,
    readProjectSkillManifest,
    resolveXpertDataVolumeScope,
    VolumeClient
} from '../../../shared/volume'
import {
    ISkillsMiddlewareOptions,
    SkillPromptMetadata,
    SkillPackageInstallMetadata,
    RuntimeSkillSelectionState,
    RuntimeSkillSelectionMode,
    ConfigRepositoryDefaultSelection,
    ConfigAutoDiscoveryOptions,
    START_STATE_KEY,
    DEFAULT_AUTO_DISCOVERY_SEARCH_LIMIT,
    MAX_AUTO_DISCOVERY_SEARCH_LIMIT,
    DEFAULT_AUTO_DISCOVERY_MAX_INSTALL_PER_RUN,
    MAX_AUTO_DISCOVERY_MAX_INSTALL_PER_RUN,
    FALLBACK_RUNTIME_ROOT_IN_CONTAINER,
    RUNTIME_SKILLS_DIRECTORY,
    SKILL_FILE_NAME,
    MAX_SKILL_FILE_SIZE,
    SKILLS_SYSTEM_PROMPT
} from './skill-types'

/** Shared selection and metadata policy; no tool registration or installation. */
export class SkillMetadataLoader {
    protected readonly logger = new Logger('SkillsMiddleware')
    @Inject(CommandBus) protected readonly commandBus: CommandBus
    constructor(
        protected readonly skillPackageRepository: Repository<SkillPackage>,
        protected readonly workspaceAccessService: XpertWorkspaceAccessService
    ) {}

    protected readSelection(value: unknown) {
        return (
            z
                .object({
                    selectedSkillIds: z.unknown().optional(),
                    disabledSkillIds: z.unknown().optional(),
                    selectedSkillWorkspaceId: z.unknown().optional(),
                    skillSelectionMode: z.unknown().optional()
                })
                .safeParse(value).data ?? {}
        )
    }

    protected sanitizeSkillIds(value: unknown): string[] {
        if (!Array.isArray(value)) {
            return []
        }

        const deduped = new Set<string>()
        for (const item of value) {
            if (typeof item !== 'string') {
                continue
            }
            const normalized = item.trim()
            if (!normalized) {
                continue
            }
            deduped.add(normalized)
        }
        return Array.from(deduped)
    }

    protected resolveDisabledSkillIds(state: Record<string, unknown>): string[] {
        const rootState = state as RuntimeSkillSelectionState
        const startState = this.readSelection(state[START_STATE_KEY])
        const rootDisabledSkillIdsRaw = rootState.disabledSkillIds
        const startDisabledSkillIdsRaw = startState.disabledSkillIds
        const rootDisabledSkillIds = this.sanitizeSkillIds(rootDisabledSkillIdsRaw)
        const startDisabledSkillIds = this.sanitizeSkillIds(startDisabledSkillIdsRaw)

        if (Array.isArray(rootDisabledSkillIdsRaw)) {
            return rootDisabledSkillIds
        }

        return startDisabledSkillIds
    }

    protected sanitizeWorkspaceId(value: unknown): string {
        return typeof value === 'string' ? value.trim() : ''
    }

    protected resolveConfiguredRepositoryDefault(
        options?: ISkillsMiddlewareOptions | null
    ): ConfigRepositoryDefaultSelection | null {
        const repositoryId = this.sanitizeWorkspaceId(options?.repositoryDefault?.repositoryId)
        if (!repositoryId) {
            return null
        }

        return {
            repositoryId,
            disabledSkillIds: this.sanitizeSkillIds(options?.repositoryDefault?.disabledSkillIds)
        }
    }

    protected normalizeInteger(value: unknown, fallback: number, min: number, max: number) {
        const parsed =
            typeof value === 'number'
                ? value
                : typeof value === 'string' && value.trim()
                  ? Number(value.trim())
                  : fallback
        if (!Number.isInteger(parsed)) {
            return fallback
        }
        return Math.min(Math.max(parsed, min), max)
    }

    protected resolveAutoDiscoveryOptions(options?: ISkillsMiddlewareOptions | null): ConfigAutoDiscoveryOptions {
        return {
            enabled: options?.autoDiscovery?.enabled === true,
            repositoryIds: this.sanitizeSkillIds(options?.autoDiscovery?.repositoryIds),
            searchLimit: this.normalizeInteger(
                options?.autoDiscovery?.searchLimit,
                DEFAULT_AUTO_DISCOVERY_SEARCH_LIMIT,
                1,
                MAX_AUTO_DISCOVERY_SEARCH_LIMIT
            ),
            maxInstallPerRun: this.normalizeInteger(
                options?.autoDiscovery?.maxInstallPerRun,
                DEFAULT_AUTO_DISCOVERY_MAX_INSTALL_PER_RUN,
                1,
                MAX_AUTO_DISCOVERY_MAX_INSTALL_PER_RUN
            )
        }
    }

    protected resolveRuntimeSkillSelection(state: Record<string, unknown>): {
        skillIds: string[]
        workspaceId: string
        hasRuntimeSelection: boolean
    } {
        const rootState = state as RuntimeSkillSelectionState
        const startState = this.readSelection(state[START_STATE_KEY])
        const rootSkillIdsRaw = state.selectedSkillIds
        const startSkillIdsRaw = startState.selectedSkillIds
        const rootSkillIds = this.sanitizeSkillIds(rootSkillIdsRaw)
        const startSkillIds = this.sanitizeSkillIds(startSkillIdsRaw)

        const hasRuntimeSelection = Array.isArray(rootSkillIdsRaw) || Array.isArray(startSkillIdsRaw)

        const skillIds = rootSkillIds.length > 0 ? rootSkillIds : startSkillIds

        const workspaceId =
            this.sanitizeWorkspaceId(rootState.selectedSkillWorkspaceId) ||
            this.sanitizeWorkspaceId(startState.selectedSkillWorkspaceId)

        return { skillIds, workspaceId, hasRuntimeSelection }
    }

    protected resolveProjectRuntimeSkillSelection(skillIds: string[], xpertId: string | undefined, projectId: string) {
        const xpertSkillIds = new Set<string>()
        const projectSkillIds = new Set<string>()

        for (const id of skillIds) {
            const source = parseRuntimeSkillCapabilityId(id)
            if (!source) {
                // Backward compatibility with Project capabilities emitted before source-aware IDs.
                projectSkillIds.add(id)
                continue
            }
            if (source.type === 'xpert' && xpertId && source.ownerId === xpertId) {
                xpertSkillIds.add(source.skillId)
            } else if (source.type === 'project' && source.ownerId === projectId) {
                projectSkillIds.add(source.skillId)
            }
        }

        return {
            xpertSkillIds: Array.from(xpertSkillIds),
            projectSkillIds: Array.from(projectSkillIds)
        }
    }

    protected resolveRuntimeSkillSelectionMode(state: Record<string, unknown>): RuntimeSkillSelectionMode | null {
        const rootState = state as RuntimeSkillSelectionState
        const startState = this.readSelection(state[START_STATE_KEY])

        if (rootState.skillSelectionMode === 'workspace_blacklist') {
            return rootState.skillSelectionMode
        }

        if (startState.skillSelectionMode === 'workspace_blacklist') {
            return startState.skillSelectionMode
        }

        return null
    }

    protected filterSkillMetadata(skills: SkillPromptMetadata[], disabledSkillIds: string[]) {
        if (!disabledSkillIds.length) {
            return skills
        }

        const disabledSkillIdSet = new Set(disabledSkillIds)
        return skills.filter((skill) => !disabledSkillIdSet.has(skill.id))
    }

    protected resolveSearchRepositoryIds(requestedRepositoryIds: string[], allowedRepositoryIds: string[]) {
        if (!allowedRepositoryIds.length) {
            return requestedRepositoryIds
        }
        if (!requestedRepositoryIds.length) {
            return allowedRepositoryIds
        }

        const allowed = new Set(allowedRepositoryIds)
        return requestedRepositoryIds.filter((repositoryId) => allowed.has(repositoryId))
    }

    protected async findInstalledSkillIndexIds(workspaceId: string, skillIndexIds: string[]) {
        if (!workspaceId || !skillIndexIds.length) {
            return new Set<string>()
        }

        const installed = await this.skillPackageRepository.find({
            where: {
                workspaceId,
                skillIndexId: In(skillIndexIds)
            }
        })

        return new Set(
            installed
                .map((skillPackage) => skillPackage.skillIndexId)
                .filter((skillIndexId): skillIndexId is string => typeof skillIndexId === 'string' && !!skillIndexId)
        )
    }

    protected formatSkillSearchResult(item: ISkillRepositoryIndex, installedSkillIndexIds: Set<string>) {
        return {
            indexId: item.id,
            skillId: item.skillId,
            name: item.name ?? item.skillId,
            description: item.description ?? '',
            tags: item.tags ?? [],
            version: item.version ?? '',
            link: item.link ?? '',
            installed: installedSkillIndexIds.has(item.id),
            repository: item.repository
                ? {
                      id: item.repository.id,
                      name: item.repository.name,
                      provider: item.repository.provider
                  }
                : {
                      id: item.repositoryId
                  }
        }
    }

    protected escapeForShell(value: string): string {
        return `'${value.replace(/'/g, `'"'"'`)}'`
    }

    protected getSandboxFromToolConfig(config: unknown): unknown {
        if (!config || typeof config !== 'object' || !('configurable' in config)) return null
        const configurable = config.configurable
        return configurable && typeof configurable === 'object' && 'sandbox' in configurable
            ? configurable.sandbox
            : null
    }

    protected getSandboxWorkingDirectory(sandbox: unknown): string {
        if (sandbox && typeof sandbox === 'object' && !Array.isArray(sandbox) && 'workingDirectory' in sandbox) {
            const workingDirectory = (sandbox as { workingDirectory?: unknown }).workingDirectory
            if (typeof workingDirectory === 'string' && workingDirectory.trim()) {
                return workingDirectory.trim()
            }
        }

        const backend = resolveSandboxBackend(sandbox)
        if (typeof backend?.workingDirectory === 'string' && backend.workingDirectory.trim()) {
            return backend.workingDirectory.trim()
        }

        return ''
    }

    protected resolveSkillsRootInContainer(sandbox: unknown): string {
        const workingDirectory = this.getSandboxWorkingDirectory(sandbox) || FALLBACK_RUNTIME_ROOT_IN_CONTAINER
        return join(workingDirectory, RUNTIME_SKILLS_DIRECTORY)
    }

    protected resolveRuntimeRootInContainer(sandbox: unknown): string {
        return this.getSandboxWorkingDirectory(sandbox) || FALLBACK_RUNTIME_ROOT_IN_CONTAINER
    }

    protected async acquireFallbackSandboxBackend(
        tenantId: string,
        userId: string,
        projectId?: string | null,
        xpertId?: string | null,
        workspaceDataScope?: IAgentMiddlewareContext['workspaceDataScope'],
        workingDirectory?: string
    ): Promise<SandboxBackendProtocol> {
        const volumeScope = projectId
            ? {
                  tenantId,
                  catalog: 'projects' as const,
                  projectId,
                  userId
              }
            : xpertId
              ? resolveXpertDataVolumeScope({ tenantId, xpertId, userId, workspaceDataScope })
              : {
                    tenantId,
                    catalog: 'users' as const,
                    userId
                }
        const sandbox = await this.commandBus.execute(
            new SandboxAcquireBackendCommand({
                tenantId,
                workingDirectory,
                volumeScope,
                workFor: projectId ? { type: 'project', id: projectId } : { type: 'user', id: userId }
            })
        )
        const candidate = resolveSandboxBackend(sandbox)
        if (!candidate) {
            throw new Error('Sandbox backend is not available.')
        }
        return candidate
    }

    protected appendWorkspaceSkills(target: Map<string, Set<string>>, workspaceId: string, skillIds: string[]) {
        if (!workspaceId || skillIds.length === 0) {
            return
        }
        const existing = target.get(workspaceId) ?? new Set<string>()
        for (const id of skillIds) {
            existing.add(id)
        }
        target.set(workspaceId, existing)
    }

    protected buildSyncKey(skills: SkillPromptMetadata[]): string {
        return skills
            .map((skill) => `${skill.workspaceId}:${skill.id}:${skill.version}`)
            .sort()
            .join('|')
    }

    protected async pathExists(path: string): Promise<boolean> {
        try {
            await access(path)
            return true
        } catch {
            return false
        }
    }

    protected normalizePackagePath(packagePath: string): string {
        return packagePath
            .replace(/\\/g, '/')
            .replace(/^\/+/, '')
            .replace(/^\.\/+/, '')
    }

    protected async resolveLocalPackagePath(workspaceRoot: string, packagePath: string): Promise<string | null> {
        const normalized = this.normalizePackagePath(packagePath)
        if (!normalized) {
            return null
        }

        const primary = join(workspaceRoot, 'skills', normalized)
        if (await this.pathExists(primary)) {
            return primary
        }

        const legacyPrefixed = normalized.startsWith('skills/') ? normalized : `skills/${normalized}`
        const legacy = join(workspaceRoot, 'skills', legacyPrefixed)
        if (legacy !== primary && (await this.pathExists(legacy))) {
            return legacy
        }

        return null
    }

    protected async resolveEffectiveWorkspaceId(
        tenantId: string,
        userId: string,
        contextWorkspaceId: string,
        stateWorkspaceId: string
    ): Promise<string> {
        if (!stateWorkspaceId || stateWorkspaceId === contextWorkspaceId) {
            return contextWorkspaceId
        }

        try {
            const canAccess = await this.canAccessWorkspace(tenantId, userId, stateWorkspaceId)
            if (canAccess) {
                return stateWorkspaceId
            }

            this.logger.warn(
                `selectedSkillWorkspaceId "${stateWorkspaceId}" is not accessible for user "${userId}" in tenant "${tenantId}", fallback to "${contextWorkspaceId}".`
            )
            return contextWorkspaceId
        } catch (error) {
            this.logger.warn(
                `Failed to verify selectedSkillWorkspaceId "${stateWorkspaceId}" for user "${userId}" in tenant "${tenantId}": ${(error as Error).message}. Fallback to "${contextWorkspaceId}".`
            )
            return contextWorkspaceId
        }
    }

    protected async canAccessWorkspace(tenantId: string, userId: string, workspaceId: string): Promise<boolean> {
        if (!tenantId || !userId || !workspaceId) {
            return false
        }

        await this.workspaceAccessService.assertCanRun(workspaceId)
        return true
    }

    protected async loadProjectSkillMetadata(
        runtimeSkillsRoot: string,
        tenantId: string,
        projectId: string,
        allowedSkillIds?: ReadonlySet<string>
    ): Promise<SkillPromptMetadata[]> {
        const projectRoot = VolumeClient._getWorkspaceRoot(tenantId, 'projects', projectId)
        const skillsRoot = join(projectRoot, 'skills')
        const skillFiles = await findValidatedProjectSkillFiles(projectRoot).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(
                t('server-ai:Error.ProjectSkillProjectionFailed', {
                    defaultValue: 'Project skills could not be prepared for this run: {{message}}',
                    message
                })
            )
        })
        const projectSkillManifest = await readProjectSkillManifest(projectRoot).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(
                t('server-ai:Error.ProjectSkillProjectionFailed', {
                    defaultValue: 'Project skills could not be prepared for this run: {{message}}',
                    message
                })
            )
        })
        const disabledSkillIds = new Set(
            projectSkillManifest.items.filter((item) => !item.enabled).map((item) => item.id)
        )
        const skills: SkillPromptMetadata[] = []
        for (const skillMdPath of skillFiles) {
            const parsed = await this.parseSkillMetadata(skillMdPath)
            if (!parsed) continue
            const relativeSkillDirectory = relative(skillsRoot, dirname(skillMdPath)).replace(/\\/g, '/') || '_root'
            if (
                disabledSkillIds.has(relativeSkillDirectory) ||
                (allowedSkillIds && !allowedSkillIds.has(relativeSkillDirectory))
            ) {
                continue
            }
            const sourceStat = await stat(skillMdPath)
            const runtimePath = join('project', relativeSkillDirectory)
            skills.push({
                id: relativeSkillDirectory,
                name: parsed.name ?? relativeSkillDirectory,
                description: parsed.description ?? '',
                path: join(runtimeSkillsRoot, runtimePath, SKILL_FILE_NAME),
                source: 'project',
                packagePath: relativeSkillDirectory,
                runtimePath,
                runtimeSource: 'project',
                workspaceId: `project:${projectId}`,
                version: String(sourceStat.mtimeMs),
                localPath: dirname(skillMdPath)
            })
        }
        return skills
    }

    protected async loadSkillMetadata(
        workspacePath: string,
        skillIds: string[],
        workspaceId: string,
        runtimeResourceOnly = false
    ): Promise<SkillPromptMetadata[]> {
        if (!workspaceId || skillIds.length === 0) {
            return []
        }

        const skillPackages = await this.skillPackageRepository.find({
            where: {
                workspaceId,
                runtimeResourceOnly,
                id: In(skillIds)
            },
            relations: { skillIndex: { repository: true } }
        })

        const skills: SkillPromptMetadata[] = []
        for (const skillPackage of skillPackages) {
            const skill = await this.parseSkillPackage(workspacePath, skillPackage)
            if (skill) {
                skills.push(skill)
            }
        }

        return skills
    }

    protected async loadWorkspaceSkillMetadata(
        workspacePath: string,
        workspaceId: string
    ): Promise<SkillPromptMetadata[]> {
        if (!workspaceId) {
            return []
        }

        const skillPackages = await this.skillPackageRepository.find({
            where: {
                workspaceId,
                runtimeResourceOnly: false
            },
            relations: { skillIndex: { repository: true } }
        })

        const skills: SkillPromptMetadata[] = []
        for (const skillPackage of skillPackages) {
            const skill = await this.parseSkillPackage(workspacePath, skillPackage)
            if (skill) {
                skills.push(skill)
            }
        }

        return skills
    }

    protected async loadRepositoryWorkspaceSkillMetadata(
        workspacePath: string,
        workspaceId: string,
        repositoryId: string
    ): Promise<SkillPromptMetadata[]> {
        if (!workspaceId || !repositoryId) {
            return []
        }

        const workspaceSkills = await this.loadWorkspaceSkillMetadata(workspacePath, workspaceId)
        return workspaceSkills.filter((skill) => skill.repositoryId === repositoryId)
    }

    protected deduplicateSkillMetadata(skills: SkillPromptMetadata[]) {
        const deduped = new Map<string, SkillPromptMetadata>()
        for (const skill of skills) {
            deduped.set(`${skill.workspaceId}:${skill.id}`, skill)
        }
        return Array.from(deduped.values())
    }

    protected withRuntimeSkillNamespace(
        runtimeSkillsRoot: string,
        source: TRuntimeSkillSource['type'],
        skill: SkillPromptMetadata
    ): SkillPromptMetadata {
        const packagePath = skill.packagePath?.trim()
        if (!packagePath) {
            return { ...skill, runtimeSource: source }
        }
        const runtimePath = join(source, packagePath)
        return {
            ...skill,
            path: join(runtimeSkillsRoot, runtimePath, SKILL_FILE_NAME),
            runtimePath,
            runtimeSource: source
        }
    }

    protected async parseSkillPackage(
        workspacePath: string,
        skillPackage: SkillPackage
    ): Promise<SkillPromptMetadata | null> {
        const metadata = this.getPackageMetadata(skillPackage)
        const skillIndex = skillPackage.skillIndex
        const localSkillMdPath = this.resolveLocalSkillPath(workspacePath, skillPackage)

        const repoOptions = skillIndex?.repository?.options
        const repoUrl =
            repoOptions &&
            typeof repoOptions === 'object' &&
            'url' in repoOptions &&
            typeof repoOptions.url === 'string'
                ? repoOptions.url
                : undefined
        const skillPath = skillIndex?.skillPath ?? ''

        const skillMdPath =
            localSkillMdPath ?? (repoUrl ? this.resolveSkillPath(workspacePath, repoUrl, skillPath) : null)
        const parsed = skillMdPath ? await this.parseSkillMetadata(skillMdPath) : null
        const packagePath = this.normalizePackagePath(skillPackage.packagePath ?? '')
        const promptSkillPath = packagePath ? join(workspacePath, packagePath, SKILL_FILE_NAME) : null

        const packageDescription = this.extractDescription(skillPackage.metadata?.description)
        const description = parsed?.description ?? packageDescription ?? skillIndex?.description ?? ''

        return {
            id: skillPackage.id,
            name: parsed?.name ?? (skillPackage.name as string) ?? skillIndex?.name ?? skillIndex?.skillId ?? 'Skill',
            description,
            path: promptSkillPath ?? skillMdPath ?? parsed?.path ?? localSkillMdPath ?? undefined,
            source: skillIndex?.repository?.provider ?? metadata?.source,
            packagePath: packagePath || null,
            repositoryId: skillIndex?.repositoryId ?? skillIndex?.repository?.id ?? undefined,
            workspaceId: skillPackage.workspaceId,
            version: skillPackage.updatedAt?.toISOString() ?? ''
        }
    }

    protected extractDescription(description?: unknown): string | undefined {
        if (typeof description === 'string') {
            return description
        }
        if (description && typeof description === 'object' && 'en_US' in description) {
            return typeof description.en_US === 'string' ? description.en_US : undefined
        }
        return undefined
    }

    protected resolveLocalSkillPath(workspacePath: string, skillPackage: SkillPackage) {
        const metadata = this.getPackageMetadata(skillPackage)
        if (!metadata) {
            return null
        }

        const skillMdPath = metadata.skillMdPath
        if (skillMdPath && this.isSafePath(skillMdPath, workspacePath)) {
            return skillMdPath
        }

        const skillPath = metadata.skillPath
        if (skillPath) {
            const resolved = isAbsolute(skillPath) ? skillPath : join(workspacePath, skillPath, SKILL_FILE_NAME)
            if (this.isSafePath(resolved, workspacePath)) {
                return resolved
            }
        }

        return null
    }

    protected getPackageMetadata(skillPackage: SkillPackage): SkillPackageInstallMetadata | null {
        return skillPackage.metadata as SkillPackageInstallMetadata | null
    }

    protected resolveSkillPath(workspacePath: string, repoUrl: string, skillPath: string) {
        try {
            const url = new URL(repoUrl)
            const [owner, repo] = url.pathname.replace(/^\/+/, '').split('/')
            if (!owner || !repo) {
                return null
            }
            const skillMdPath = join(workspacePath, owner, repo, skillPath, SKILL_FILE_NAME)
            return this.isSafePath(skillMdPath, workspacePath) ? skillMdPath : null
        } catch (error) {
            this.logger.warn(`Failed to resolve skill path from ${repoUrl}: ${(error as Error).message}`)
            return null
        }
    }

    protected async parseSkillMetadata(
        skillMdPath: string
    ): Promise<{ name?: string; description?: string; path: string } | null> {
        try {
            const stats = await stat(skillMdPath)
            if (stats.size > MAX_SKILL_FILE_SIZE) {
                return null
            }

            const content = await readFile(skillMdPath, 'utf-8')
            const match = /^---\s*\n(.*?)\n---\s*\n/s.exec(content)
            if (!match) {
                return null
            }

            const metadata: Record<string, string> = {}
            for (const line of match[1].split('\n')) {
                const kv = /^(\w+):\s*(.+)$/.exec(line.trim())
                if (kv) {
                    metadata[kv[1]] = kv[2].trim()
                }
            }

            if (!metadata.name && !metadata.description) {
                return null
            }

            return {
                name: metadata.name ?? 'Skill',
                description: metadata.description ?? '',
                path: skillMdPath
            }
        } catch {
            return null
        }
    }

    protected buildSkillsSection(workspace: string, skills: SkillPromptMetadata[]) {
        const skillsLocations = this.formatSkillsLocations(workspace, skills)
        const skillsList = this.formatSkillsList(skills)
        return SKILLS_SYSTEM_PROMPT.replace('{skills_locations}', skillsLocations).replace('{skills_list}', skillsList)
    }

    protected formatSkillsLocations(workspace: string, skills: SkillPromptMetadata[]) {
        if (!skills?.length) {
            return `Skills are installed under \`${workspace}\`. No skills are enabled yet.`
        }
        const dirs = Array.from(
            new Set(
                skills
                    .map((skill) => (skill.path ? dirname(skill.path) : null))
                    .filter((path): path is string => !!path)
            )
        )
        return dirs.map((dir) => `**Installed Skills**: \`${dir}\``).join('\n')
    }

    protected formatSkillsList(skills: SkillPromptMetadata[]) {
        if (!skills?.length) {
            return '(No skills available yet. Install skills to enable this middleware.)'
        }
        return skills
            .map((skill) => {
                const description = skill.description || 'No description provided.'
                const path = skill.path || 'Skill path is unavailable.'
                return `- **${skill.name}**: ${description}\n  → Read \`${path}\` for full instructions`
            })
            .join('\n')
    }

    protected isSafePath(target: string, baseDir: string) {
        try {
            const resolvedPath = resolve(target)
            const resolvedBase = resolve(baseDir)
            const relativePath = relative(resolvedBase, resolvedPath)
            return !relativePath.startsWith('..') && !isAbsolute(relativePath)
        } catch {
            return false
        }
    }

    protected resolvePathInsideBase(target: string, baseDir: string): string | null {
        try {
            const resolvedBase = resolve(baseDir)
            const resolvedPath = isAbsolute(target) ? resolve(target) : resolve(resolvedBase, target)
            return this.isSafePath(resolvedPath, resolvedBase) ? resolvedPath : null
        } catch {
            return null
        }
    }
}
