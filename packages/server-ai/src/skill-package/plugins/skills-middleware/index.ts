import {
    RUNTIME_RESOURCE_SKILLS,
    RuntimeResourceMiddlewareContext
} from '../../../agent-plugin/runtime-resource-context'
import { readRuntimeResourceSkillFile } from '../../../agent-plugin/runtime-resource-skill-file'
import { RegisteredSkillUsage, registerSkillUsages, skillReadResult } from './skill-usage'
import { SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    AgentMiddleware,
    AgentMiddlewareStrategy,
    IAgentMiddlewareContext,
    IAgentMiddlewareStrategy,
    resolveSandboxBackend
} from '@xpert-ai/plugin-sdk'
import { isAbsolute, join, relative } from 'path'
import { In, Repository } from 'typeorm'
import { z } from 'zod/v3'
import { t } from 'i18next'
import { SkillPackage } from '../../skill-package.entity'
import { SkillPackageService } from '../../skill-package.service'
import { SKILLS_MIDDLEWARE_NAME } from '../../types'
import { SandboxCopyTreeCommand } from '../../../sandbox'
import type { WorkspaceBinding } from '../../../shared'
import { SkillRepositoryIndexService } from '../../../skill-repository/repository-index/skill-repository-index.service'
import { XpertWorkspaceAccessService, getWorkspaceRoot } from '../../../xpert-workspace'
import {
    InstallProjectSkillCommand,
    ListProjectSkillsCommand
} from '../../../xpert-project/commands/project-skills.command'
import { SkillMetadataLoader } from './skill-metadata'
import { skillsMiddlewareMeta } from './skill-meta'
import { readSkillFileDisplayMetadata } from './skill-tool-display'
import {
    ISkillsMiddlewareOptions,
    SkillPromptMetadata,
    SkillSyncRecord,
    FALLBACK_RUNTIME_ROOT_IN_CONTAINER,
    RUNTIME_SKILLS_DIRECTORY,
    MAX_AUTO_DISCOVERY_SEARCH_LIMIT,
    AUTO_DISCOVERY_SYSTEM_PROMPT,
    PROJECT_SKILL_PRIORITY_SYSTEM_PROMPT
} from './skill-types'
export type { ISkillsMiddlewareOptions } from './skill-types'

@Injectable()
@AgentMiddlewareStrategy(SKILLS_MIDDLEWARE_NAME)
export class SkillsMiddleware
    extends SkillMetadataLoader
    implements IAgentMiddlewareStrategy<ISkillsMiddlewareOptions>
{
    constructor(
        @InjectRepository(SkillPackage) skillPackageRepository: Repository<SkillPackage>,
        workspaceAccessService: XpertWorkspaceAccessService,
        private readonly skillPackageService: SkillPackageService,
        private readonly skillIndexService: SkillRepositoryIndexService
    ) {
        super(skillPackageRepository, workspaceAccessService)
    }

    readonly meta = skillsMiddlewareMeta

    readonly stateSchema = z.object({
        selectedSkillIds: z.array(z.string()).optional(),
        disabledSkillIds: z.array(z.string()).optional(),
        selectedSkillWorkspaceId: z.string().optional(),
        skillSelectionMode: z.literal('workspace_blacklist').optional()
    })

    async createMiddleware(
        options: ISkillsMiddlewareOptions,
        context: IAgentMiddlewareContext
    ): Promise<AgentMiddleware> {
        const { tenantId, userId, workspaceId: contextWorkspaceId, projectId, xpertId, workspaceDataScope } = context
        const normalizedContextWorkspaceId = this.sanitizeWorkspaceId(contextWorkspaceId)
        const autoDiscoveryOptions = this.resolveAutoDiscoveryOptions(options)
        const discoveryEnabled = autoDiscoveryOptions.enabled && !options?.resourceOnly
        this.logger.debug(`SkillsMiddleware using context workspace: ${normalizedContextWorkspaceId}`)
        const resourceSources =
            (context as IAgentMiddlewareContext & RuntimeResourceMiddlewareContext)[RUNTIME_RESOURCE_SKILLS] ?? []
        let activeResourceSkills: SkillPromptMetadata[] = []
        let registeredSkillUsages: RegisteredSkillUsage[] = []
        let runtimeSandbox: unknown = null
        let runtimeSkillsRootInContainer = join(FALLBACK_RUNTIME_ROOT_IN_CONTAINER, RUNTIME_SKILLS_DIRECTORY)
        let runtimeWorkingDirectory = ''
        let lastEffectiveWorkspaceId = normalizedContextWorkspaceId
        const autoInstalledProjectSkillIds = new Set<string>()
        const autoInstalledSkillSelections = new Map<string, Set<string>>()
        const inflightSyncs = new Map<string, SkillSyncRecord>()
        const skillSyncsByContainerPath = new Map<string, SkillSyncRecord>()

        const getSandboxWorkspaceBinding = (sandbox: unknown): Partial<WorkspaceBinding> | null => {
            if (!sandbox || typeof sandbox !== 'object' || Array.isArray(sandbox)) {
                return null
            }

            const workspaceBinding = (sandbox as { workspaceBinding?: unknown }).workspaceBinding
            if (!workspaceBinding || typeof workspaceBinding !== 'object' || Array.isArray(workspaceBinding)) {
                return null
            }
            return workspaceBinding as Partial<WorkspaceBinding>
        }

        const buildWorkspaceBindingIdentity = (workspaceBinding: Partial<WorkspaceBinding> | null) => {
            if (!workspaceBinding) {
                return ''
            }

            return JSON.stringify([
                workspaceBinding.volumeRoot ?? '',
                workspaceBinding.bindSource ?? '',
                workspaceBinding.workspaceRoot ?? '',
                workspaceBinding.containerMountPath ?? '',
                workspaceBinding.workspacePath ?? ''
            ])
        }

        const buildSandboxSyncIdentity = (sandbox: unknown) => {
            const backendId = resolveSandboxBackend(sandbox)?.id ?? 'unknown'
            const workspaceIdentity = buildWorkspaceBindingIdentity(getSandboxWorkspaceBinding(sandbox))
            return workspaceIdentity ? `${backendId}:${workspaceIdentity}` : backendId
        }

        const getSkillSyncPathKey = (sandboxIdentity: string, containerPath: string) => {
            return `${sandboxIdentity}:${containerPath}`
        }

        const buildSkillSyncKey = (sandbox: unknown, containerPath: string, version: string) => {
            return `${buildSandboxSyncIdentity(sandbox)}:${containerPath}:${version}`
        }

        const clearSkillSyncRecord = (record: SkillSyncRecord) => {
            if (inflightSyncs.get(record.key) === record) {
                inflightSyncs.delete(record.key)
            }
            const pathKey = getSkillSyncPathKey(record.sandboxIdentity, record.containerPath)
            if (skillSyncsByContainerPath.get(pathKey) === record) {
                skillSyncsByContainerPath.delete(pathKey)
            }
        }

        const clearInflightSkillSyncRecord = (record: SkillSyncRecord) => {
            if (inflightSyncs.get(record.key) === record) {
                inflightSyncs.delete(record.key)
            }
        }

        const syncSkillToSandbox = async (
            sandbox: unknown,
            runtimeSkillsRoot: string,
            skill: SkillPromptMetadata
        ): Promise<void> => {
            const packagePath = skill.packagePath?.trim()
            if (!packagePath) {
                return
            }
            const runtimePath = skill.runtimePath?.trim() || packagePath

            const localSkillPath =
                skill.localPath ??
                (await this.resolveLocalPackagePath(getWorkspaceRoot(tenantId, skill.workspaceId), packagePath))
            if (!localSkillPath) {
                this.logger.warn(
                    `Skip syncing skill "${skill.name}" because package path "${packagePath}" is missing in workspace "${skill.workspaceId}".`
                )
                return
            }
            await this.commandBus.execute(
                new SandboxCopyTreeCommand(sandbox, {
                    version: skill.version,
                    localPath: localSkillPath,
                    containerPath: join(runtimeSkillsRoot, runtimePath),
                    overwrite: true
                })
            )
        }

        const scheduleSkillSync = (
            sandbox: unknown,
            runtimeSkillsRoot: string,
            skill: SkillPromptMetadata
        ): SkillSyncRecord | null => {
            const packagePath = skill.packagePath?.trim()
            if (!packagePath) {
                return null
            }

            const runtimePath = skill.runtimePath?.trim() || packagePath
            const containerPath = join(runtimeSkillsRoot, runtimePath)
            const sandboxIdentity = buildSandboxSyncIdentity(sandbox)
            const pathKey = getSkillSyncPathKey(sandboxIdentity, containerPath)
            const key = buildSkillSyncKey(sandbox, containerPath, String(skill.version))
            const existing = inflightSyncs.get(key)
            if (existing) {
                this.logger.log(
                    `Reuse inflight skill sync skill=${skill.name} containerPath=${containerPath} key=${key}`
                )
                return existing
            }

            const start = Date.now()
            let record: SkillSyncRecord
            const promise = syncSkillToSandbox(sandbox, runtimeSkillsRoot, skill)
                .then(() => {
                    this.logger.log(
                        `Finished async skill sync skill=${skill.name} containerPath=${containerPath} key=${key} totalMs=${Date.now() - start}`
                    )
                })
                .catch((error) => {
                    record.error = error as Error
                    this.logger.error(
                        `Failed async skill sync skill=${skill.name} containerPath=${containerPath} key=${key}: ${(error as Error).message}`
                    )
                })
                .finally(() => {
                    if (record.error) {
                        clearInflightSkillSyncRecord(record)
                        return
                    }
                    clearSkillSyncRecord(record)
                })
            record = {
                containerPath,
                key,
                promise,
                sandboxIdentity,
                skill
            }

            inflightSyncs.set(key, record)
            skillSyncsByContainerPath.set(pathKey, record)
            this.logger.log(`Scheduled skill sync skill=${skill.name} containerPath=${containerPath} key=${key}`)
            return record
        }

        const scheduleSkillsToSandbox = (
            sandbox: unknown,
            runtimeSkillsRoot: string,
            skills: SkillPromptMetadata[]
        ) => {
            return skills
                .map((skill) => scheduleSkillSync(sandbox, runtimeSkillsRoot, skill))
                .filter((record): record is SkillSyncRecord => Boolean(record))
        }

        const findSkillSyncForPath = (sandbox: unknown, fullPath: string): SkillSyncRecord | null => {
            const sandboxIdentity = buildSandboxSyncIdentity(sandbox)
            let matched: SkillSyncRecord | null = null
            for (const record of skillSyncsByContainerPath.values()) {
                if (record.sandboxIdentity !== sandboxIdentity) {
                    continue
                }
                const relativePath = relative(record.containerPath, fullPath)
                const isInside = relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
                if (!isInside) {
                    continue
                }
                if (!matched || record.containerPath.length > matched.containerPath.length) {
                    matched = record
                }
            }
            return matched
        }

        const waitForSkillSyncIfNeeded = async (sandbox: unknown, fullPath: string) => {
            const record = findSkillSyncForPath(sandbox, fullPath)
            if (!record) {
                return
            }
            this.logger.log(`Waiting for skill sync before reading file skill=${record.skill.name} path=${fullPath}`)
            await record.promise
            if (record.error) {
                throw record.error
            }
        }

        /**
         * Read skill's file tool
         */
        const readSkillFile = tool(
            async ({ path }, config) => {
                const sandbox = this.getSandboxFromToolConfig(config) ?? runtimeSandbox
                const runtimeRoot = this.resolveRuntimeRootInContainer(sandbox)
                const fullPath = this.resolvePathInsideBase(path, runtimeRoot)
                if (!fullPath) {
                    throw new Error(`Access to path "${path}" is denied.`)
                }
                // Only the registered main file counts; reading a skill's supporting files is not activation.
                const usage = registeredSkillUsages.find((skill) => skill.path === fullPath)

                if (!resolveSandboxBackend(sandbox)) {
                    for (const skill of activeResourceSkills) {
                        const suffix = relative(
                            join(runtimeSkillsRootInContainer, skill.runtimePath || skill.packagePath),
                            fullPath
                        )
                        if (!suffix || isAbsolute(suffix) || suffix === '..' || suffix.startsWith('../')) continue
                        const source =
                            skill.localPath ??
                            (await this.resolveLocalPackagePath(
                                getWorkspaceRoot(tenantId, skill.workspaceId),
                                skill.packagePath
                            ))
                        if (source)
                            return skillReadResult(await readRuntimeResourceSkillFile(source, suffix), usage, config)
                    }
                }

                await waitForSkillSyncIfNeeded(sandbox, fullPath)

                const sandboxBackend = resolveSandboxBackend(sandbox)
                if (sandboxBackend) {
                    const result = await sandboxBackend.execute(`cat ${this.escapeForShell(fullPath)}`)
                    if (result.exitCode !== 0) {
                        throw new Error(result.output || `Failed to read file: ${fullPath}`)
                    }
                    return skillReadResult(result.output, usage, config)
                }

                const fallbackBackend = await this.acquireFallbackSandboxBackend(
                    tenantId,
                    userId,
                    projectId,
                    xpertId,
                    workspaceDataScope,
                    this.getSandboxWorkingDirectory(sandbox) || runtimeWorkingDirectory || undefined
                )
                const result = await fallbackBackend.execute(`cat ${this.escapeForShell(fullPath)}`)
                if (result.exitCode !== 0) {
                    throw new Error(result.output || `Failed to read file: ${fullPath}`)
                }
                return skillReadResult(result.output, usage, config)
            },
            {
                name: 'read_skill_file',
                metadata: readSkillFileDisplayMetadata,
                responseFormat: 'content_and_artifact',
                description: `Read a skill's file from the current working directory. Use this to read full SKILL.md instructions from installed skills, including .xpert/skills and .agents/skills.`,
                schema: z.object({
                    path: z
                        .string()
                        .describe(
                            "The path to the skill's file to read. It must stay inside the current working directory."
                        )
                })
            }
        )

        const listSkills = tool(
            async () => {
                if (projectId) return this.commandBus.execute(new ListProjectSkillsCommand(projectId))
                const items = await this.loadWorkspaceSkillMetadata(
                    runtimeSkillsRootInContainer,
                    lastEffectiveWorkspaceId
                )
                return {
                    items: items.map(({ id, name, path, description, source }) => ({
                        id,
                        name,
                        path,
                        description,
                        source
                    })),
                    total: items.length
                }
            },
            {
                name: 'list_skills',
                description:
                    'List installed skills in the current scope, including disabled Project skills. Project installations persist across threads. Scope is selected by the host; no target ID or directory is needed. Project paths are relative to the current workarea.',
                schema: z.object({}).strict()
            }
        )

        const searchSkillRepository = tool(
            async ({ query, limit, repositoryIds }) => {
                const projectSkills = projectId
                    ? await this.commandBus.execute(new ListProjectSkillsCommand(projectId, 'edit'))
                    : null
                const search = typeof query === 'string' ? query.trim() : ''
                const requestedLimit = this.normalizeInteger(
                    limit,
                    autoDiscoveryOptions.searchLimit,
                    1,
                    MAX_AUTO_DISCOVERY_SEARCH_LIMIT
                )
                const take = Math.min(requestedLimit, autoDiscoveryOptions.searchLimit)
                const searchRepositoryIds = this.resolveSearchRepositoryIds(
                    this.sanitizeSkillIds(repositoryIds),
                    autoDiscoveryOptions.repositoryIds
                )

                if (autoDiscoveryOptions.repositoryIds.length && !searchRepositoryIds.length) {
                    return {
                        items: [],
                        total: 0,
                        message: 'No configured skill repositories match the requested repository scope.'
                    }
                }

                const { items, total } = await this.skillIndexService.findMarketplace(
                    {
                        where: searchRepositoryIds.length
                            ? {
                                  repositoryId: In(searchRepositoryIds)
                              }
                            : undefined,
                        order: {
                            updatedAt: 'DESC'
                        },
                        take
                    },
                    search
                )
                const skillIndexIds = items.map((item) => item.id).filter((id): id is string => typeof id === 'string')
                const installedSkillIndexIds = projectSkills
                    ? new Set(projectSkills.items.flatMap((item) => (item.skillIndexId ? [item.skillIndexId] : [])))
                    : await this.findInstalledSkillIndexIds(lastEffectiveWorkspaceId, skillIndexIds)

                return {
                    query: search,
                    ...(projectId ? { projectId } : { workspaceId: lastEffectiveWorkspaceId }),
                    total,
                    ...(total
                        ? {}
                        : {
                              guidance:
                                  'No matching skill exists in the configured, accessible catalog. This is not a search of all GitHub repositories. After an exact-name search and one broader query without a match, report the missing catalog source; do not repeatedly guess or use another Project.'
                          }),
                    items: items.map((item) => this.formatSkillSearchResult(item, installedSkillIndexIds))
                }
            },
            {
                name: 'search_skill_repository',
                description:
                    'Search indexed skill repositories for skills relevant to the user task. Use this before installing new skills when current installed skills are insufficient.',
                schema: z
                    .object({
                        query: z
                            .string()
                            .max(500)
                            .describe(
                                'An exact skill name or one short keyword. Catalog search uses literal text matching, not semantic search; do not combine many keywords into a sentence.'
                            ),
                        limit: z
                            .number()
                            .int()
                            .positive()
                            .optional()
                            .describe('Optional result limit for this search.'),
                        repositoryIds: z
                            .array(z.string())
                            .optional()
                            .describe(
                                'Optional repository IDs to narrow the search within the configured repository scope.'
                            )
                    })
                    .strict()
            }
        )

        const installSkills = tool(
            async ({ indexIds }) => {
                const normalizedIndexIds = this.sanitizeSkillIds(indexIds)
                if (!normalizedIndexIds.length) {
                    throw new Error('indexIds must contain at least one skill repository index ID.')
                }
                if (normalizedIndexIds.length > autoDiscoveryOptions.maxInstallPerRun) {
                    throw new Error(
                        `Too many skills requested. Install at most ${autoDiscoveryOptions.maxInstallPerRun} skills in one call.`
                    )
                }
                if (projectId) {
                    const installed = []
                    for (const indexId of normalizedIndexIds) {
                        const skill = await this.commandBus.execute(
                            new InstallProjectSkillCommand(projectId, indexId, autoDiscoveryOptions.repositoryIds)
                        )
                        installed.push(skill)
                        if (skill.enabled) autoInstalledProjectSkillIds.add(skill.id)
                    }
                    // The next model call awaits projection before advertising enabled installations.
                    // Canonical paths are already in the Project workarea and survive the current thread.
                    return { projectId, installed }
                }
                if (!lastEffectiveWorkspaceId) {
                    throw new Error('Workspace context is required to install skills.')
                }

                const installedPackageIds: string[] = []
                for (const indexId of normalizedIndexIds) {
                    if (autoDiscoveryOptions.repositoryIds.length) {
                        const index = await this.skillIndexService.findOneInOrganizationOrTenant(indexId)
                        if (!autoDiscoveryOptions.repositoryIds.includes(index.repositoryId)) {
                            throw new Error(
                                t('server-ai:Error.SkillRepositoryOutsideScope', {
                                    defaultValue: 'The selected skill is outside the configured repository scope.'
                                })
                            )
                        }
                    }
                    const skillPackage = await this.skillPackageService.ensureInstalledSkillPackage(
                        lastEffectiveWorkspaceId,
                        indexId
                    )
                    if (skillPackage?.id) {
                        installedPackageIds.push(skillPackage.id)
                        const workspaceSelections =
                            autoInstalledSkillSelections.get(lastEffectiveWorkspaceId) ?? new Set<string>()
                        workspaceSelections.add(skillPackage.id)
                        autoInstalledSkillSelections.set(lastEffectiveWorkspaceId, workspaceSelections)
                    }
                }

                const installedSkills = await this.loadSkillMetadata(
                    runtimeSkillsRootInContainer,
                    installedPackageIds,
                    lastEffectiveWorkspaceId
                )
                scheduleSkillsToSandbox(runtimeSandbox, runtimeSkillsRootInContainer, installedSkills)

                return {
                    workspaceId: lastEffectiveWorkspaceId,
                    installed: installedSkills.map((skill) => ({
                        id: skill.id,
                        name: skill.name,
                        description: skill.description ?? '',
                        path: skill.path,
                        repositoryId: skill.repositoryId
                    }))
                }
            },
            {
                name: 'install_skills',
                description:
                    'Install relevant missing skills from search_skill_repository results. The host persists complete packages in the current Project, or in the authoring Workspace outside a Project, for reuse in future threads. Existing Project skills are reused without overwriting edits or enabling disabled skills. Check enabled state, then read the returned SKILL.md path with read_skill_file (Project paths are relative to the workarea).',
                schema: z
                    .object({
                        indexIds: z
                            .array(z.string())
                            .min(1)
                            .describe('Skill repository index IDs returned by search_skill_repository.')
                    })
                    .strict()
            }
        )

        let skillsSynced = false
        // Track which selection was last synced to avoid re-copying on every model call
        let lastSyncedKey = ''

        return {
            name: SKILLS_MIDDLEWARE_NAME,
            stateSchema: this.stateSchema,
            tools: [
                readSkillFile,
                ...(!options?.resourceOnly ? [listSkills] : []),
                ...(discoveryEnabled ? [searchSkillRepository, installSkills] : [])
            ],
            wrapModelCall: async (request, handler) => {
                runtimeSandbox = request.runtime?.configurable?.sandbox ?? null
                runtimeWorkingDirectory = this.getSandboxWorkingDirectory(runtimeSandbox)
                runtimeSkillsRootInContainer = this.resolveSkillsRootInContainer(runtimeSandbox)
                const state = (request.state ?? {}) as Record<string, unknown>
                const disabledSkillIds = this.resolveDisabledSkillIds(state)
                const runtimeSkillSelectionMode = this.resolveRuntimeSkillSelectionMode(state)
                const sanitizedConfiguredSkillIds = this.sanitizeSkillIds(options?.skills)
                const hasConfiguredSkillOverride =
                    runtimeSkillSelectionMode !== 'workspace_blacklist' && sanitizedConfiguredSkillIds.length > 0
                const configuredSkillIds = hasConfiguredSkillOverride ? sanitizedConfiguredSkillIds : []
                const configuredRepositoryDefault =
                    runtimeSkillSelectionMode === 'workspace_blacklist'
                        ? null
                        : this.resolveConfiguredRepositoryDefault(options)
                const {
                    skillIds: runtimeSkillIds,
                    workspaceId: stateWorkspaceId,
                    hasRuntimeSelection
                } = this.resolveRuntimeSkillSelection(state)
                const runtimeWorkspaceId = await this.resolveEffectiveWorkspaceId(
                    tenantId,
                    userId,
                    normalizedContextWorkspaceId,
                    stateWorkspaceId
                )
                const shouldUseConfiguredDefaults =
                    runtimeSkillSelectionMode !== 'workspace_blacklist' && !hasRuntimeSelection
                lastEffectiveWorkspaceId = runtimeWorkspaceId

                const projectRuntimeSelection = projectId
                    ? this.resolveProjectRuntimeSkillSelection(runtimeSkillIds, xpertId, projectId)
                    : null

                const workspaceSkillSelections = new Map<string, Set<string>>()
                if (shouldUseConfiguredDefaults && hasConfiguredSkillOverride) {
                    this.appendWorkspaceSkills(
                        workspaceSkillSelections,
                        normalizedContextWorkspaceId,
                        configuredSkillIds
                    )
                }
                if (
                    runtimeSkillSelectionMode !== 'workspace_blacklist' &&
                    hasRuntimeSelection &&
                    runtimeSkillIds.length > 0
                ) {
                    this.appendWorkspaceSkills(workspaceSkillSelections, runtimeWorkspaceId, runtimeSkillIds)
                }
                if (runtimeSkillSelectionMode !== 'workspace_blacklist') {
                    const autoInstalledSkillIds = autoInstalledSkillSelections.get(runtimeWorkspaceId)
                    if (autoInstalledSkillIds?.size) {
                        this.appendWorkspaceSkills(
                            workspaceSkillSelections,
                            runtimeWorkspaceId,
                            Array.from(autoInstalledSkillIds)
                        )
                    }
                }

                const skills: SkillPromptMetadata[] = []
                if (projectId) {
                    const selectedProjectSkillIds = hasRuntimeSelection
                        ? new Set([
                              ...(projectRuntimeSelection?.projectSkillIds ?? []),
                              ...autoInstalledProjectSkillIds
                          ])
                        : undefined
                    const projectSkills = await this.loadProjectSkillMetadata(
                        runtimeSkillsRootInContainer,
                        tenantId,
                        projectId,
                        selectedProjectSkillIds
                    )
                    skills.push(...projectSkills)

                    if (normalizedContextWorkspaceId) {
                        let xpertSkills: SkillPromptMetadata[] = []
                        if (hasRuntimeSelection) {
                            const selectedXpertSkillIds = projectRuntimeSelection?.xpertSkillIds ?? []
                            if (selectedXpertSkillIds.length && hasConfiguredSkillOverride) {
                                const configuredSkillIdSet = new Set(configuredSkillIds)
                                xpertSkills = await this.loadSkillMetadata(
                                    runtimeSkillsRootInContainer,
                                    selectedXpertSkillIds.filter((id) => configuredSkillIdSet.has(id)),
                                    normalizedContextWorkspaceId
                                )
                            } else if (selectedXpertSkillIds.length && configuredRepositoryDefault) {
                                const repositorySkills = await this.loadRepositoryWorkspaceSkillMetadata(
                                    runtimeSkillsRootInContainer,
                                    normalizedContextWorkspaceId,
                                    configuredRepositoryDefault.repositoryId
                                )
                                const selectedSkillIdSet = new Set(selectedXpertSkillIds)
                                xpertSkills = this.filterSkillMetadata(
                                    repositorySkills.filter((skill) => selectedSkillIdSet.has(skill.id)),
                                    configuredRepositoryDefault.disabledSkillIds
                                )
                            }
                        } else if (hasConfiguredSkillOverride) {
                            xpertSkills = await this.loadSkillMetadata(
                                runtimeSkillsRootInContainer,
                                configuredSkillIds,
                                normalizedContextWorkspaceId
                            )
                        } else if (configuredRepositoryDefault) {
                            const repositorySkills = await this.loadRepositoryWorkspaceSkillMetadata(
                                runtimeSkillsRootInContainer,
                                normalizedContextWorkspaceId,
                                configuredRepositoryDefault.repositoryId
                            )
                            xpertSkills = this.filterSkillMetadata(
                                repositorySkills,
                                configuredRepositoryDefault.disabledSkillIds
                            )
                        }
                        skills.push(
                            ...xpertSkills.map((skill) =>
                                this.withRuntimeSkillNamespace(runtimeSkillsRootInContainer, 'xpert', skill)
                            )
                        )
                    }
                } else if (runtimeSkillSelectionMode === 'workspace_blacklist' && stateWorkspaceId) {
                    const workspaceSkills = await this.loadWorkspaceSkillMetadata(
                        runtimeSkillsRootInContainer,
                        runtimeWorkspaceId
                    )
                    skills.push(...workspaceSkills)
                } else if (shouldUseConfiguredDefaults && configuredRepositoryDefault) {
                    const workspaceSkills = await this.loadRepositoryWorkspaceSkillMetadata(
                        runtimeSkillsRootInContainer,
                        normalizedContextWorkspaceId,
                        configuredRepositoryDefault.repositoryId
                    )
                    skills.push(
                        ...this.filterSkillMetadata(workspaceSkills, configuredRepositoryDefault.disabledSkillIds)
                    )
                } else if (shouldUseConfiguredDefaults && !hasConfiguredSkillOverride) {
                    const workspaceSkills = await this.loadWorkspaceSkillMetadata(
                        runtimeSkillsRootInContainer,
                        normalizedContextWorkspaceId
                    )
                    skills.push(...workspaceSkills)
                }
                if (!projectId) {
                    for (const [workspaceId, ids] of workspaceSkillSelections.entries()) {
                        const workspaceSkills = await this.loadSkillMetadata(
                            runtimeSkillsRootInContainer,
                            Array.from(ids),
                            workspaceId
                        )
                        skills.push(...workspaceSkills)
                    }
                }
                if (
                    !projectId &&
                    shouldUseConfiguredDefaults &&
                    hasConfiguredSkillOverride &&
                    configuredSkillIds.length > 0 &&
                    !configuredRepositoryDefault &&
                    !skills.length
                ) {
                    const workspaceSkills = await this.loadWorkspaceSkillMetadata(
                        runtimeSkillsRootInContainer,
                        normalizedContextWorkspaceId
                    )
                    skills.push(...workspaceSkills)
                }
                if (options?.resourceOnly) skills.length = 0
                skills.push(
                    ...resourceSources.map((source) => ({
                        id: source.id,
                        name: source.name,
                        description: source.description,
                        workspaceId: normalizedContextWorkspaceId,
                        version: source.version,
                        localPath: source.rootPath,
                        packagePath: source.runtimePath,
                        runtimePath: source.runtimePath,
                        path: join(runtimeSkillsRootInContainer, source.runtimePath, 'SKILL.md')
                    }))
                )
                const effectiveSkills = this.filterSkillMetadata(
                    this.deduplicateSkillMetadata(skills),
                    disabledSkillIds
                )
                registeredSkillUsages = registerSkillUsages(effectiveSkills, resourceSources, context)

                activeResourceSkills = effectiveSkills.filter((skill) =>
                    resourceSources.some((source) => source.id === skill.id)
                )
                const syncKey = this.buildSyncKey(effectiveSkills)
                const sandbox = request.runtime.configurable.sandbox
                const sandboxScopedSyncKey = `${buildSandboxSyncIdentity(sandbox)}:${syncKey}`
                if (!skillsSynced || sandboxScopedSyncKey !== lastSyncedKey) {
                    const records = scheduleSkillsToSandbox(
                        sandbox,
                        runtimeSkillsRootInContainer,
                        resolveSandboxBackend(sandbox)
                            ? effectiveSkills
                            : effectiveSkills.filter(
                                  (skill) => !activeResourceSkills.some((resource) => resource.id === skill.id)
                              )
                    )
                    if (projectId) {
                        await Promise.all(records.map((record) => record.promise))
                        const failure = records.find((record) => record.error)?.error
                        if (failure) {
                            throw new Error(
                                t('server-ai:Error.ProjectSkillProjectionFailed', {
                                    defaultValue: 'Project skills could not be prepared for this run: {{message}}',
                                    message: failure.message
                                })
                            )
                        }
                    }
                    skillsSynced = true
                    lastSyncedKey = sandboxScopedSyncKey
                }

                const skillsSection = this.buildSkillsSection(runtimeSkillsRootInContainer, effectiveSkills)
                const extraPrompt = [
                    options?.systemPrompt,
                    skillsSection,
                    projectId ? PROJECT_SKILL_PRIORITY_SYSTEM_PROMPT : null,
                    discoveryEnabled ? AUTO_DISCOVERY_SYSTEM_PROMPT : null
                ]
                    .filter(Boolean)
                    .join('\n\n')

                if (!extraPrompt) {
                    return handler(request)
                }

                const systemMessage = request.systemMessage
                const current = typeof systemMessage === 'string' ? systemMessage : (systemMessage?.content ?? '')
                const content =
                    typeof current === 'string'
                        ? [current, extraPrompt].filter(Boolean).join('\n\n')
                        : [...current, { type: 'text' as const, text: extraPrompt }]

                return handler({
                    ...request,
                    systemMessage: new SystemMessage({ content })
                })
            }
        }
    }
}
