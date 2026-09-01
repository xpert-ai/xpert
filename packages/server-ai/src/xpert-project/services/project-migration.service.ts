import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectMilestone } from '../entities/project-milestone.entity'
import { XpertProjectPlan } from '../entities/project-plan.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectAsset } from '../entities/project-asset.entity'
import { XpertProjectAutomation } from '../entities/project-automation.entity'
import { XpertProjectMembership } from '../entities/project-membership.entity'
import { VOLUME_CLIENT, VolumeClient } from '../../shared/volume'
import { XpertProjectContentService } from './project-content.service'
import { XpertProjectXpertBindingService } from './project-xpert-binding.service'

@Injectable()
export class XpertProjectMigrationService implements OnApplicationBootstrap {
    readonly #logger = new Logger(XpertProjectMigrationService.name)

    constructor(
        @InjectRepository(XpertProject) private readonly projectRepository: Repository<XpertProject>,
        @InjectRepository(XpertProjectPlan) private readonly planRepository: Repository<XpertProjectPlan>,
        @InjectRepository(XpertProjectMilestone)
        private readonly milestoneRepository: Repository<XpertProjectMilestone>,
        @InjectRepository(XpertProjectTask) private readonly taskRepository: Repository<XpertProjectTask>,
        @InjectRepository(XpertProjectAsset) private readonly assetRepository: Repository<XpertProjectAsset>,
        @InjectRepository(XpertProjectAutomation)
        private readonly automationRepository: Repository<XpertProjectAutomation>,
        @InjectRepository(XpertProjectMembership)
        private readonly membershipRepository: Repository<XpertProjectMembership>,
        private readonly contentService: XpertProjectContentService,
        private readonly xpertBindingService: XpertProjectXpertBindingService,
        @Inject(VOLUME_CLIENT) private readonly volumeClient: VolumeClient
    ) {}

    async onApplicationBootstrap() {
        try {
            await this.backfill()
        } catch (error) {
            this.#logger.warn(`Project backfill skipped: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    async backfill() {
        const projects = await this.projectRepository.find({ relations: ['members', 'xperts'] })
        for (const project of projects) {
            await this.runPhase(project, 'defaults', () => this.ensureDefaults(project))
            await this.runPhase(project, 'memberships', () => this.backfillMemberships(project))
            await this.runPhase(project, 'xperts', () => this.xpertBindingService.normalize(project, { persist: true }))
            await this.runPhase(project, 'tasks', () => this.normalizeTasks(project.id))
            await this.runPhase(project, 'assets', () => this.indexAssets(project))
            await this.runPhase(project, 'content', () => this.contentService.initialize(project))
            await this.runPhase(project, 'automations', () =>
                this.automationRepository.update({ projectId: project.id, enabled: true }, { enabled: false })
            )
        }
        return projects.length
    }

    private async runPhase(project: XpertProject, phase: ProjectBackfillPhase, operation: () => Promise<unknown>) {
        try {
            await operation()
        } catch (error) {
            this.#logger.warn(
                `Project backfill phase failed: projectId=${project.id} phase=${phase} error=${
                    error instanceof Error ? error.message : String(error)
                }`
            )
        }
    }

    async ensureDefaults(project: XpertProject) {
        let changed = false
        if (!project.ownerId && project.createdById) {
            project.ownerId = project.createdById
            changed = true
        }
        if (!project.settings?.managementMode) {
            project.settings = { ...(project.settings ?? { instruction: '' }), managementMode: 'simple' }
            changed = true
        }
        if (changed) await this.projectRepository.save(project)
        let plan = await this.planRepository.findOne({ where: { projectId: project.id, name: 'Default plan' } })
        if (!plan) {
            plan = await this.planRepository.save(
                this.planRepository.create({
                    projectId: project.id,
                    name: 'Default plan',
                    description: 'Migrated project plan',
                    status: 'active',
                    view: 'board',
                    order: 0,
                    tenantId: project.tenantId,
                    organizationId: project.organizationId,
                    createdById: project.createdById
                })
            )
        }
        const milestone = await this.milestoneRepository.findOne({
            where: { projectId: project.id, planId: plan.id, name: 'Uncategorized' }
        })
        if (!milestone) {
            await this.milestoneRepository.save(
                this.milestoneRepository.create({
                    projectId: project.id,
                    planId: plan.id,
                    name: 'Uncategorized',
                    status: 'planned',
                    order: 0,
                    tenantId: project.tenantId,
                    organizationId: project.organizationId,
                    createdById: project.createdById
                })
            )
        }
    }

    async backfillMemberships(project: XpertProject) {
        for (const user of project.members ?? []) {
            if (!user.id || user.id === project.ownerId) continue
            const existing = await this.membershipRepository.findOne({
                where: { projectId: project.id, userId: user.id },
                withDeleted: true
            })
            if (existing && !existing.deletedAt) continue
            if (existing) {
                existing.deletedAt = null
                existing.removedAt = null
                existing.role = 'member'
                existing.joinedAt = existing.joinedAt ?? project.createdAt ?? new Date()
                await this.membershipRepository.save(existing)
            } else {
                await this.membershipRepository.save(
                    this.membershipRepository.create({
                        projectId: project.id,
                        userId: user.id,
                        role: 'member',
                        joinedAt: project.createdAt ?? new Date(),
                        tenantId: project.tenantId,
                        organizationId: project.organizationId,
                        createdById: project.createdById
                    })
                )
            }
        }
    }

    async normalizeTasks(projectId: string) {
        const tasks = await this.taskRepository.find({ where: { projectId } })
        for (const task of tasks) {
            const status = mapLegacyTaskStatus(task.status)
            if (status !== task.status) {
                task.status = status
                await this.taskRepository.save(task)
            }
        }
    }

    async indexAssets(project: XpertProject) {
        const existing = await this.assetRepository.find({ where: { projectId: project.id } })
        const paths = new Set(existing.map((asset) => asset.path))
        const client = await this.volumeClient
            .resolve({
                tenantId: project.tenantId,
                userId: project.ownerId,
                catalog: 'projects',
                projectId: project.id
            })
            .ensureRoot()
        const entries = (await client.list({ path: '/', deepth: 64 })) ?? []
        for (const entry of flattenVolumeEntries(entries)) {
            const path = entry.fullPath?.replace(/^\/+/, '') || entry.filePath
            if (!path || paths.has(path) || XpertProjectContentService.isGovernedPath(path)) continue
            paths.add(path)
            await this.assetRepository.save(
                this.assetRepository.create({
                    projectId: project.id,
                    name: entry.filePath,
                    path,
                    kind: entry.fileType === 'directory' ? 'folder' : 'file',
                    mimeType: entry.fileType && entry.fileType !== 'directory' ? entry.fileType : undefined,
                    size: entry.size,
                    source: 'import',
                    status: 'available',
                    tenantId: project.tenantId,
                    organizationId: project.organizationId,
                    createdById: project.createdById
                })
            )
        }

        const attachments = await this.assetRepository.manager.getRepository(XpertProject).findOne({
            where: { id: project.id },
            relations: ['attachments']
        })
        for (const attachment of attachments?.attachments ?? []) {
            const path = `attachments/${attachment.originalName || attachment.file || attachment.id}`
            if (paths.has(path)) continue
            paths.add(path)
            await this.assetRepository.save(
                this.assetRepository.create({
                    projectId: project.id,
                    name: attachment.originalName || attachment.file || attachment.id,
                    path,
                    kind: 'file',
                    mimeType: attachment.mimetype,
                    size: attachment.size,
                    source: 'import',
                    status: 'available',
                    tenantId: project.tenantId,
                    organizationId: project.organizationId,
                    createdById: project.createdById
                })
            )
        }
        await this.reconcileAssetParents(project.id)
    }

    private async reconcileAssetParents(projectId: string) {
        const assets = await this.assetRepository.find({ where: { projectId } })
        const byPath = new Map(assets.map((asset) => [asset.path.replace(/^\/+/, ''), asset]))
        const updates: XpertProjectAsset[] = []

        for (const asset of assets) {
            const path = asset.path.replace(/^\/+/, '')
            const separator = path.lastIndexOf('/')
            if (separator < 0) continue
            const parent = byPath.get(path.slice(0, separator))
            if (parent?.kind !== 'folder' || asset.parentId === parent.id) continue
            asset.parentId = parent.id
            updates.push(asset)
        }

        for (let index = 0; index < updates.length; index += 500) {
            await this.assetRepository.save(updates.slice(index, index + 500))
        }
    }
}

type ProjectBackfillPhase = 'defaults' | 'memberships' | 'xperts' | 'tasks' | 'assets' | 'content' | 'automations'

type ProjectVolumeEntry = {
    filePath?: string
    fullPath?: string
    fileType?: string
    size?: number
    children?: ProjectVolumeEntry[]
}

function flattenVolumeEntries(entries: ProjectVolumeEntry[]): Array<Omit<ProjectVolumeEntry, 'children'>> {
    return entries.flatMap((entry) => [
        { filePath: entry.filePath, fullPath: entry.fullPath, fileType: entry.fileType, size: entry.size },
        ...flattenVolumeEntries(entry.children ?? [])
    ])
}

function mapLegacyTaskStatus(status: XpertProjectTask['status']): XpertProjectTask['status'] {
    switch (status) {
        case 'pending':
            return 'todo'
        case 'completed':
            return 'done'
        case 'failed':
            return 'blocked'
        default:
            return status
    }
}
