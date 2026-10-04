import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ISkillRepository, ISkillRepositoryIndex, WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER } from '@xpert-ai/contracts'
import { Cache } from 'cache-manager'
import { In } from 'typeorm'
import { SkillRepositoryIndexService } from '../../../skill-repository/repository-index/skill-repository-index.service'
import { SkillRepositoryService } from '../../../skill-repository/skill-repository.service'
import { TResolvedSkillRef, TTemplateSkillBundle, TWorkspaceDefaultSkillRef } from '../../template.types'
import { getSkillRefKey, getTemplateSkillBundles, resolveFeaturedSkillIds } from '../../utils/template-skills'
import { EnsureTemplateDirectoryCommand } from '../ensure-template-directory.command'
import { ResolveTemplateSkillRefsCommand } from '../resolve-template-skill-refs.command'

@CommandHandler(ResolveTemplateSkillRefsCommand)
export class ResolveTemplateSkillRefsHandler implements ICommandHandler<ResolveTemplateSkillRefsCommand> {
    constructor(
        private readonly skillRepositoryService: SkillRepositoryService,
        private readonly skillRepositoryIndexService: SkillRepositoryIndexService,
        private readonly commands: CommandBus,
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
    ) {}

    async execute({ refs: skillRefs }: ResolveTemplateSkillRefsCommand): Promise<TResolvedSkillRef[]> {
        if (!skillRefs.length) {
            return []
        }

        const resolved: TResolvedSkillRef[] = []
        const resolvedByKey = await this.resolveSkillRefsByKey(skillRefs)
        for (const ref of skillRefs) {
            const skill = resolvedByKey.get(getSkillRefKey(ref))
            if (skill) {
                resolved.push({
                    ref,
                    skill
                })
            }
        }

        return resolved
    }

    private async getRepositoriesByKey() {
        const { items: repositories } = await this.skillRepositoryService.findAllInOrganizationOrTenant()
        const repositoriesByKey = new Map<string, ISkillRepository>()

        for (const repository of repositories) {
            const key = `${repository.provider}:${repository.name}`
            const existing = repositoriesByKey.get(key)
            if (!existing) {
                repositoriesByKey.set(key, repository)
                continue
            }

            if (!existing.organizationId && repository.organizationId) {
                repositoriesByKey.set(key, repository)
            }
        }

        return repositoriesByKey
    }

    private async resolveSkillRefsByKey(skillRefs: TWorkspaceDefaultSkillRef[]) {
        const repositoriesByKey = await this.getRepositoriesByKey()
        const bundlesByKey = await this.getTemplateSkillBundlesByRefKey()
        const workspacePublicRepository = Array.from(repositoriesByKey.values()).find(
            (candidate) => candidate.provider === WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER
        )
        const remoteSkillIdsByRepository = new Map<string, Set<string>>()
        const bundleSharedSkillIds = new Set<string>()

        for (const ref of skillRefs) {
            const key = getSkillRefKey(ref)
            const bundle = bundlesByKey.get(key)
            if (bundle) {
                bundleSharedSkillIds.add(bundle.sharedSkillId)
                continue
            }

            const repository = repositoriesByKey.get(`${ref.provider}:${ref.repositoryName}`)
            if (!repository?.id) {
                continue
            }

            const skillIds = resolveFeaturedSkillIds(ref.skillId, repository)
            const knownSkillIds = remoteSkillIdsByRepository.get(repository.id) ?? new Set<string>()
            for (const skillId of skillIds) {
                knownSkillIds.add(skillId)
            }
            remoteSkillIdsByRepository.set(repository.id, knownSkillIds)
        }

        const resolvedByKey = new Map<string, ISkillRepositoryIndex>()
        const bundleIndexBySharedSkillId = new Map<string, ISkillRepositoryIndex>()
        if (workspacePublicRepository?.id && bundleSharedSkillIds.size) {
            const { items } = await this.skillRepositoryIndexService.findAllInOrganizationOrTenant({
                where: {
                    repositoryId: workspacePublicRepository.id,
                    skillId: In(Array.from(bundleSharedSkillIds))
                },
                relations: ['repository'],
                order: {
                    updatedAt: 'DESC'
                },
                take: bundleSharedSkillIds.size
            })
            for (const item of items) {
                if (!bundleIndexBySharedSkillId.has(item.skillId)) {
                    bundleIndexBySharedSkillId.set(item.skillId, item)
                }
            }
        }

        const remoteIndexByRepositoryKey = new Map<string, ISkillRepositoryIndex>()
        for (const [repositoryId, skillIds] of remoteSkillIdsByRepository.entries()) {
            const requestedSkillIds = Array.from(skillIds)
            if (!requestedSkillIds.length) {
                continue
            }

            const { items } = await this.skillRepositoryIndexService.findAllInOrganizationOrTenant({
                where: {
                    repositoryId,
                    skillId: In(requestedSkillIds)
                },
                relations: ['repository'],
                order: {
                    updatedAt: 'DESC'
                },
                take: requestedSkillIds.length
            })
            for (const item of items) {
                const indexKey = `${repositoryId}:${item.skillId}`
                if (!remoteIndexByRepositoryKey.has(indexKey)) {
                    remoteIndexByRepositoryKey.set(indexKey, item)
                }
            }
        }

        for (const ref of skillRefs) {
            const key = getSkillRefKey(ref)
            const bundle = bundlesByKey.get(key)
            if (bundle) {
                const bundleSkill = bundleIndexBySharedSkillId.get(bundle.sharedSkillId)
                if (bundleSkill) {
                    resolvedByKey.set(key, bundleSkill)
                }
                continue
            }

            const repository = repositoriesByKey.get(`${ref.provider}:${ref.repositoryName}`)
            if (!repository?.id) {
                continue
            }

            for (const skillId of resolveFeaturedSkillIds(ref.skillId, repository)) {
                const skill = remoteIndexByRepositoryKey.get(`${repository.id}:${skillId}`)
                if (skill) {
                    resolvedByKey.set(key, skill)
                    break
                }
            }
        }

        return resolvedByKey
    }

    private async getTemplateSkillBundlesByRefKey() {
        const bundles = await getTemplateSkillBundles(
            await this.commands.execute(new EnsureTemplateDirectoryCommand()),
            this.cacheManager
        )
        const bundlesByKey = new Map<string, TTemplateSkillBundle>()

        for (const bundle of bundles) {
            const key = getSkillRefKey(bundle.ref)
            if (!bundlesByKey.has(key)) {
                bundlesByKey.set(key, bundle)
            }
        }

        return bundlesByKey
    }
}
