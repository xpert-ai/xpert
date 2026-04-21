import {
	I18nObject,
	ISkillRepository,
	ISkillRepositoryIndex,
	ISkillRepositoryIndexPublisher,
	TSkillSourceMeta,
	WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ISkillSourceProvider, SkillSourceProviderStrategy } from '@xpert-ai/plugin-sdk'
import { cp, mkdir, rm, stat } from 'fs/promises'
import { join } from 'path'
import { Repository } from 'typeorm'
import { SkillPackage } from '../../../skill-package/skill-package.entity'
import { getOrganizationSharedSkillPath } from '../../types'

const readLocalizedText = (value?: string | I18nObject | null): string | undefined => {
	if (!value) {
		return undefined
	}

	if (typeof value === 'string') {
		const normalized = value.trim()
		return normalized || undefined
	}

	return value.en_US?.trim() || value.zh_Hans?.trim() || undefined
}

const normalizeInstallPath = (value?: string | null) =>
	(value ?? 'skill')
		.trim()
		.replace(/\\/g, '/')
		.replace(/^\/+/, '')
		.replace(/\/+$/, '')
		.replace(/[^\w/-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^[-/]+/, '')
		.replace(/[-/]+$/, '') || 'skill'

const toPublisher = (author?: { name?: string; email?: string; org?: string } | null): ISkillRepositoryIndexPublisher | undefined => {
	const name = author?.name?.trim()
	if (!name) {
		return undefined
	}

	return {
		displayName: name,
		name
	}
}

const buildSharedSkillStats = (version?: string | null) => ({
	comments: 0,
	downloads: 0,
	installsAllTime: 0,
	installsCurrent: 0,
	stars: 0,
	versions: version?.trim() ? 1 : 0
})

@Injectable()
@SkillSourceProviderStrategy(WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER)
export class WorkspacePublicSkillSourceProvider implements ISkillSourceProvider {
	readonly type = WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER

	readonly meta: TSkillSourceMeta = {
		name: WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER,
		label: {
			en_US: 'Workspace Shared Skills',
			zh_Hans: '工作区共享技能'
		},
		description: {
			en_US: 'System managed repository for workspace skills shared to the current scope.',
			zh_Hans: '系统管理的当前作用域工作区技能共享仓库。'
		},
		icon: { type: 'svg', value: '' }
	}

	constructor(
		@InjectRepository(SkillPackage)
		private readonly skillPackageRepository: Repository<SkillPackage>
	) {}

	canHandle(sourceType: string): boolean {
		return sourceType === WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER
	}

	async listSkills(repository: ISkillRepository): Promise<ISkillRepositoryIndex[]> {
		const tenantId = repository.tenantId
		const organizationId = repository.organizationId
		if (!tenantId || !repository.id) {
			return []
		}

		const query = this.skillPackageRepository
			.createQueryBuilder('skill_package')
			.where('skill_package.tenantId = :tenantId', { tenantId })
			.andWhere('skill_package.skillIndexId IS NULL')
			.andWhere('skill_package.sharedSkillId IS NOT NULL')
			.andWhere('skill_package.sharedPackagePath IS NOT NULL')
			.andWhere('skill_package.publishAt IS NOT NULL')
			.orderBy('skill_package.updatedAt', 'DESC')

		if (organizationId) {
			query.andWhere('skill_package.organizationId = :organizationId', { organizationId })
		} else {
			query.andWhere('skill_package.organizationId IS NULL')
		}

		const skillPackages = await query.getMany()

		return skillPackages
			.filter((skillPackage) => !!skillPackage.sharedSkillId && !!skillPackage.sharedPackagePath)
			.map((skillPackage) => {
				const metadata = skillPackage.metadata
				const skillId = skillPackage.sharedSkillId!
				return {
					repositoryId: repository.id,
					skillId,
					skillPath: skillPackage.sharedPackagePath ?? skillId,
					name:
						readLocalizedText(metadata?.displayName) ||
						skillPackage.name ||
						metadata?.name ||
						skillId,
					description: readLocalizedText(metadata?.description),
					license: metadata?.license,
					tags: metadata?.tags ?? [],
					version: metadata?.version,
					publisher: toPublisher(metadata?.author),
					stats: buildSharedSkillStats(metadata?.version)
				}
			})
	}

	async installSkillPackage(index: ISkillRepositoryIndex, installDir: string): Promise<string> {
		const tenantId = index.repository?.tenantId ?? index.tenantId
		const organizationId = index.repository?.organizationId ?? index.organizationId
		if (!tenantId) {
			throw new Error('Missing tenant context for shared skill install')
		}

		const sourcePath = getOrganizationSharedSkillPath(tenantId, organizationId, index.skillId)
		const targetPath = join(installDir, normalizeInstallPath(index.skillId || index.skillPath || index.name))
		const sourceStat = await stat(sourcePath).catch(() => null)
		if (!sourceStat?.isDirectory()) {
			throw new Error('Shared skill snapshot not found')
		}

		await mkdir(installDir, { recursive: true })
		await rm(targetPath, { recursive: true, force: true })
		await cp(sourcePath, targetPath, { recursive: true })

		return normalizeInstallPath(index.skillId || index.skillPath || index.name)
	}

	async uninstallSkillPackage(path: string): Promise<void> {
		if (!path) {
			return
		}

		await rm(path, { recursive: true, force: true })
	}
}
