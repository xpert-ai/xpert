import { getErrorMessage } from '@metad/server-common'
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext, SkillSourceProviderRegistry } from '@xpert-ai/plugin-sdk'
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import { Repository } from 'typeorm'
import { getWorkspaceSkillsRoot, SkillRepositoryIndexService } from '../skill-repository'
import { FILE_SKILL_SOURCE_PROVIDER, IUploadedSkill, ZipSkillSourceProvider } from '../skill-repository/plugins/zip'
import { XpertWorkspaceBaseService } from '../xpert-workspace'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'
import { SkillPackage } from './skill-package.entity'

@Injectable()
export class SkillPackageService extends XpertWorkspaceBaseService<SkillPackage> {
	readonly #logger = new Logger(SkillPackageService.name)

	@Inject(SkillSourceProviderRegistry)
	private readonly skillSourceProviderRegistry: SkillSourceProviderRegistry

	constructor(
		@InjectRepository(SkillPackage)
		repository: Repository<SkillPackage>,
		private readonly skillIndexService: SkillRepositoryIndexService,
		@InjectRepository(XpertWorkspace)
		private readonly workspaceRepository: Repository<XpertWorkspace>
	) {
		super(repository)
	}

	async installSkillPackage(workspaceId: string, indexId: string) {
		if (!workspaceId) {
			throw new BadRequestException('workspaceId is required')
		}
		await this.assertWorkspaceAccess(workspaceId)
		const index = await this.skillIndexService.findOneInOrganizationOrTenant(indexId, { relations: ['repository'] })
		const strategy = this.skillSourceProviderRegistry.get(index.repository.provider)
		try {
			// Install directory
			const installDir = getWorkspaceSkillsRoot(index.repository.tenantId, workspaceId)
			const packagePath = this.normalizePackagePath(
				await strategy.installSkillPackage(index, installDir),
				installDir
			)

			// Install to database
			const skillPackage = await this.create({
				workspaceId,
				name: index.name ?? index.skillPath.split('/').pop(),
				skillIndexId: index.id,
				packagePath,
				metadata: {
					description: {
						en_US: index.description || ''
					},
					tags: index.tags ?? [],
					version: index.version
				}
			})

			return skillPackage
		} catch (error) {
			this.#logger.error(`Failed to install skill package: ${getErrorMessage(error)}`)
			throw new BadRequestException(`Failed to install skill package: ${getErrorMessage(error)}`)
		}
	}

	async uninstallSkillPackage(id: string) {
		const skillPackage = await this.findOne(id, { relations: ['skillIndex', 'skillIndex.repository'] })
		return this.uninstallResolvedSkillPackage(skillPackage)
	}

	async uninstallSkillPackageInWorkspace(workspaceId: string, id: string) {
		if (!workspaceId) {
			throw new BadRequestException('workspaceId is required')
		}
		await this.assertWorkspaceAccess(workspaceId)
		const skillPackage = await this.findOne(id, {
			where: { workspaceId },
			relations: ['skillIndex', 'skillIndex.repository']
		})
		return this.uninstallResolvedSkillPackage(skillPackage, workspaceId)
	}

	private async uninstallResolvedSkillPackage(skillPackage: SkillPackage, expectedWorkspaceId?: string) {
		const provider =
			skillPackage.skillIndex?.repository?.provider ?? (skillPackage.metadata as any)?.source ?? undefined

		const tenantId = skillPackage.tenantId
		const workspaceId = skillPackage.workspaceId
		if (!tenantId || !workspaceId) {
			throw new BadRequestException('Missing tenant or workspace context for uninstall')
		}
		if (expectedWorkspaceId && expectedWorkspaceId !== workspaceId) {
			throw new BadRequestException('Skill does not belong to the specified workspace')
		}
		await this.assertWorkspaceAccess(workspaceId)

		const installDir = getWorkspaceSkillsRoot(tenantId, workspaceId)
		const installPath = this.resolveInstalledPath(skillPackage, installDir)
		// if (!installPath) {
		// 	throw new BadRequestException('Unable to locate installed skill path')
		// }

		try {
			if (provider && installPath) {
				const strategy = this.skillSourceProviderRegistry.get(provider)
				await strategy.uninstallSkillPackage(installPath)
			}
			await this.repository.softDelete(skillPackage.id)
			return { id: skillPackage.id, uninstalled: true }
		} catch (error) {
			this.#logger.error(`Failed to uninstall skill package: ${getErrorMessage(error)}`)
			throw new BadRequestException(`Failed to uninstall skill package: ${getErrorMessage(error)}`)
		}
	}

	/**
	 * Upload and install skills from a zip archive directly into a workspace.
	 */
	async uploadSkillPackagesFromFile(workspaceId: string, file: Express.Multer.File) {
		if (!workspaceId) {
			throw new BadRequestException('workspaceId is required')
		}
		if (!file?.buffer) {
			throw new BadRequestException('A valid zip file is required')
		}
		await this.assertWorkspaceAccess(workspaceId)

		const tenantId = RequestContext.currentTenantId()
		if (!tenantId) {
			throw new BadRequestException('Tenant context is missing')
		}

		try {
			const strategy = this.skillSourceProviderRegistry.get(FILE_SKILL_SOURCE_PROVIDER) as ZipSkillSourceProvider
			if (!strategy?.installFromZip) {
				throw new BadRequestException('File upload strategy is not available')
			}

			const installDir = getWorkspaceSkillsRoot(tenantId, workspaceId)
			const uploadedSkills = await strategy.installFromZip(file.buffer, installDir)
			if (!uploadedSkills.length) {
				throw new BadRequestException('No skills found in the uploaded archive')
			}
			const packages: SkillPackage[] = []

			for (const skill of uploadedSkills) {
				const packagePath = this.resolveUploadPackagePath(skill, installDir)
				packages.push(
					await this.create({
						workspaceId,
						name: skill.name,
						packagePath,
						metadata: this.buildMetadataForUpload(skill)
					})
				)
			}

			return packages
		} catch (error) {
			this.#logger.error(`Failed to upload skill package: ${getErrorMessage(error)}`)
			throw new BadRequestException(`Failed to upload skill package: ${getErrorMessage(error)}`)
		}
	}

	private buildMetadataForUpload(skill: IUploadedSkill) {
		const normalizedSkillPath = this.normalizeRelativePackagePath(skill.skillPath ?? '')
		return {
			description: {
				en_US: skill.description ?? ''
			},
			tags: skill.tags ?? [],
			license: skill.license,
			version: skill.version,
			skillPath: normalizedSkillPath ?? skill.skillPath,
			source: FILE_SKILL_SOURCE_PROVIDER,
			skillMdPath: skill.absolutePath,
			resources: skill.resources
		}
	}

	private resolveInstalledPath(skillPackage: SkillPackage, installDir: string) {
		if (skillPackage.packagePath) {
			const packageAbsPath = join(installDir, skillPackage.packagePath)
			const safePath = this.ensureWithinInstall(packageAbsPath, installDir)
			if (safePath) {
				return safePath
			}
		}

		return null
		// throw new BadRequestException('Unable to resolve installed skill package path')
	}

	private resolveUploadPackagePath(skill: IUploadedSkill, installDir: string) {
		if (!skill?.absolutePath) {
			return null
		}
		const packageAbsPath = dirname(skill.absolutePath)
		const safePath = this.ensureWithinInstall(packageAbsPath, installDir)
		return safePath ? this.normalizeRelativePackagePath(relative(installDir, safePath)) : null
	}

	private ensureWithinInstall(targetPath: string, installDir: string) {
		const root = resolve(installDir)
		const resolvedPath = resolve(targetPath)
		const relativePath = relative(root, resolvedPath)
		if (relativePath.startsWith('..') || relativePath.startsWith('/')) {
			return null
		}
		return resolvedPath
	}

	private normalizePackagePath(packagePath: string, installDir: string) {
		if (!packagePath) {
			return null
		}
		const absPath = isAbsolute(packagePath) ? packagePath : join(installDir, packagePath)
		const safePath = this.ensureWithinInstall(absPath, installDir)
		return safePath ? this.normalizeRelativePackagePath(relative(installDir, safePath)) : null
	}

	private normalizeRelativePackagePath(packagePath: string) {
		const unixPath = packagePath
			.replace(/\\/g, '/')
			.replace(/^\/+/, '')
			.replace(/^\.\/+/, '')
		const normalized = unixPath.replace(/^(skills\/)+/, '')
		return normalized || null
	}

	private async assertWorkspaceAccess(workspaceId: string) {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const userId = RequestContext.currentUserId()
		if (!tenantId || !userId) {
			throw new ForbiddenException('Missing tenant or user context')
		}

		const query = this.workspaceRepository
			.createQueryBuilder('workspace')
			.leftJoin('workspace.members', 'member')
			.where('workspace.id = :workspaceId', { workspaceId })
			.andWhere('workspace.tenantId = :tenantId', { tenantId })
			.andWhere('(workspace.ownerId = :userId OR member.id = :userId)', { userId })

		if (organizationId) {
			query.andWhere('workspace.organizationId = :organizationId', { organizationId })
		} else {
			query.andWhere('workspace.organizationId IS NULL')
		}

		const workspace = await query.getOne()
		if (!workspace) {
			throw new ForbiddenException('Access denied to workspace')
		}
	}
}
