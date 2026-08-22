import {
    IKnowledgebase,
    IStorageFile,
    IUser,
    IXpertProject,
    IXpertProjectTaskConversation,
    IXpertProjectTaskExecution,
    IXpertProjectTask,
    IXpertProjectVCS,
    IXpertToolset,
    IXpert,
    OrderTypeEnum
} from '@xpert-ai/contracts'
import type { ProjectEnsureInput, ProjectEnsureResult } from '@xpert-ai/plugin-sdk'
import {
    applyWhereToQueryBuilder,
    EventNameIntegrationAuthorized,
    IntegrationAuthorizedEvent,
    PaginationParams,
    RequestContext,
    StorageFileDeleteCommand,
    TenantOrganizationAwareCrudService
} from '@xpert-ai/server-core'
import { yaml } from '@xpert-ai/server-common'
import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { OnEvent } from '@nestjs/event-emitter'
import { assign, omit } from 'lodash'
import { Brackets, IsNull, Repository } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { FindXpertToolsetsQuery } from '../xpert-toolset'
import { ToolsetPublicDTO } from '../xpert-toolset/dto'
import { XpertIdentiDto } from '../xpert/dto'
import { FindXpertQuery } from '../xpert/queries'
import { XpertProject } from './entities/project.entity'
import { XpertProjectTask } from './entities/project-task.entity'
import { XpertProjectTaskStep } from './entities/project-task-step.entity'
import { XpertProjectPlan } from './entities/project-plan.entity'
import { XpertProjectMilestone } from './entities/project-milestone.entity'
import { XpertProjectAsset } from './entities/project-asset.entity'
import { XpertProjectAutomation } from './entities/project-automation.entity'
import { XpertProjectTaskService } from './services/'
import { KnowledgebasePublicDTO } from '../knowledgebase/dto'
import { KnowledgebaseGetOneQuery } from '../knowledgebase/queries'
import { ExportProjectCommand } from './commands'

@Injectable()
export class XpertProjectService extends TenantOrganizationAwareCrudService<XpertProject> {
    readonly #logger = new Logger(XpertProjectService.name)

    constructor(
        @InjectRepository(XpertProject)
        repository: Repository<XpertProject>,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly taskService: XpertProjectTaskService
    ) {
        super(repository)
    }

    /**
     * Create or reconcile a caller-idempotent Chat Project and Assistant link.
     * The authenticated user remains the owner and the caller-supplied id is never replaced.
     */
    async ensureManagedProject(input: ProjectEnsureInput): Promise<ProjectEnsureResult> {
        const projectId = requiredProjectText(input.projectId, 'projectId', 100)
        const workspaceId = requiredProjectText(input.workspaceId, 'workspaceId', 100)
        const xpertId = requiredProjectText(input.xpertId, 'xpertId', 100)
        const name = requiredProjectText(input.name, 'name', 240)
        const user = RequestContext.currentUser()
        if (!user?.id || !user.tenantId) {
            throw new ForbiddenException('An authenticated user is required')
        }

        const organizationId = RequestContext.getOrganizationId()
        const xpert: IXpert = await this.queryBus.execute(new FindXpertQuery({ id: xpertId }))
        if (xpert.workspaceId !== workspaceId) {
            throw new BadRequestException('The Assistant does not belong to the requested workspace')
        }

        // Tenant and organization participate in lookup so retries cannot adopt
        // a same-id Project from a different security boundary.
        let project = await this.repository.findOne({
            where: {
                id: projectId,
                tenantId: user.tenantId,
                organizationId: organizationId ?? IsNull()
            },
            relations: ['xperts']
        })
        const operation = project ? 'updated' : 'created'
        if (project && project.ownerId !== user.id) {
            throw new ForbiddenException('Only the Project owner can synchronize this Project')
        }

        if (!project) {
            project = await this.create({
                id: projectId,
                name,
                status: input.status,
                workspaceId,
                ownerId: user.id,
                xperts: [xpert]
            })
        } else {
            // Bid/business state is authoritative while existing Assistant
            // connections are preserved and de-duplicated.
            project.name = name
            project.status = input.status
            project.workspaceId = workspaceId
            project.xperts ??= []
            if (!project.xperts.some((item) => item.id === xpertId)) {
                project.xperts.push(xpert)
            }
            project = await this.repository.save(project)
        }

        return {
            projectId: project.id,
            workspaceId,
            xpertIds: project.xperts?.map((item) => item.id) ?? [xpertId],
            operation
        }
    }

    /** Require active Project membership and an explicit Assistant connection. */
    async assertRuntimeAccess(projectId: string, xpertId: string): Promise<XpertProject> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()
        const project = await this.repository
            .createQueryBuilder('project')
            .leftJoinAndSelect('project.xperts', 'xpert')
            .leftJoin('project.members', 'member')
            .where('project.id = :projectId', { projectId })
            .andWhere('project.tenantId = :tenantId', { tenantId })
            .andWhere(organizationId ? 'project.organizationId = :organizationId' : 'project.organizationId IS NULL', {
                organizationId
            })
            .andWhere('(project.ownerId = :userId OR project.createdById = :userId OR member.id = :userId)', { userId })
            .andWhere('xpert.id = :xpertId', { xpertId })
            .andWhere("project.status <> 'archived'")
            .getOne()
        if (!project) {
            throw new ForbiddenException('The requested Project is not available')
        }
        return project
    }

    async assertProjectAccess(projectId: string): Promise<XpertProject> {
        const userId = RequestContext.currentUserId()
        const project = await this.repository
            .createQueryBuilder('project')
            .leftJoinAndSelect('project.members', 'member')
            .where('project.id = :projectId', { projectId })
            .andWhere('project.tenantId = :tenantId', { tenantId: RequestContext.currentTenantId() })
            .andWhere(
                RequestContext.getOrganizationId()
                    ? 'project.organizationId = :organizationId'
                    : 'project.organizationId IS NULL',
                {
                    organizationId: RequestContext.getOrganizationId()
                }
            )
            .andWhere('(project.ownerId = :userId OR project.createdById = :userId OR member.id = :userId)', { userId })
            .getOne()
        if (!project) throw new ForbiddenException('The requested Project is not available')
        return project
    }

    public async update(id: string, partialEntity: QueryDeepPartialEntity<XpertProject>): Promise<XpertProject> {
        const project = await this.findOne(id)
        const nextMode = (partialEntity.settings as IXpertProject['settings'] | undefined)?.managementMode
        if (project.settings?.managementMode === 'advanced' && nextMode === 'simple') {
            throw new BadRequestException('Advanced projects cannot be downgraded to simple mode')
        }
        if (partialEntity.copilotModel) {
            project.copilotModel ??= {}
            assign(project.copilotModel, partialEntity.copilotModel)
        }
        if (partialEntity.settings) {
            partialEntity.settings = {
                ...(project.settings ?? { instruction: '' }),
                ...(partialEntity.settings as IXpertProject['settings'])
            }
        }
        assign(project, omit(partialEntity, 'copilotModel'))
        return await this.repository.save(project)
    }

    async archive(id: string): Promise<XpertProject> {
        return this.update(id, { status: 'archived' })
    }

    /**
     * Query all projects I have permission to view.
     *
     * @param options
     * @returns
     */
    async findAllMy(options: PaginationParams<XpertProject>) {
        const user = RequestContext.currentUser()
        const organizationId = RequestContext.getOrganizationId()
        const requestedStatus = !Array.isArray(options?.where)
            ? (options?.where as Record<string, unknown> | undefined)?.status
            : undefined

        const orderBy = options?.order
            ? Object.keys(options.order).reduce((order, name) => {
                  order[`project.${name}`] = options.order[name]
                  return order
              }, {})
            : {}

        const query = this.repository
            .createQueryBuilder('project')
            .leftJoinAndSelect('project.members', 'member')
            .where('project.tenantId = :tenantId')
            .andWhere(
                new Brackets((qb) => {
                    qb.where('project.ownerId = :userId')
                        .orWhere('project.createdById = :userId')
                        .orWhere('member.id = :userId')
                })
            )
            .orderBy(orderBy)
            .setParameters({
                tenantId: user.tenantId,
                userId: user.id
            })

        if (requestedStatus === 'all') {
            // Explicitly requested by the Project workspace so archived projects
            // can be filtered client-side without changing legacy callers.
        } else if (typeof requestedStatus === 'string' && requestedStatus.length > 0) {
            query.andWhere('project.status = :projectStatus', { projectStatus: requestedStatus })
        } else {
            query.andWhere(
                new Brackets((qb) => {
                    qb.where(`project.status <> 'archived'`).orWhere(`project.status IS NULL`)
                })
            )
        }

        if (organizationId) {
            query.andWhere('project.organizationId = :organizationId', { organizationId })
        } else {
            query.andWhere('project.organizationId IS NULL')
        }

        if (options?.where) {
            const where = Array.isArray(options.where)
                ? options.where
                : Object.fromEntries(Object.entries(options.where).filter(([key]) => key !== 'status'))
            if (Array.isArray(where) ? where.length > 0 : Object.keys(where).length > 0) {
                applyWhereToQueryBuilder(query, 'project', where)
            }
        }

        if (options?.skip) {
            query.skip(options.skip)
        }
        if (options?.take) {
            query.take(options.take)
        }

        const projects = await query.getMany()

        return {
            items: projects,
            total: projects.length
        }
    }

    async getXperts(id: string, params: PaginationParams<IXpertProject>) {
        const project = await this.findOne({
            where: { id },
            relations: ['xperts', ...(params?.relations?.map((relation) => `xperts.${relation}`) ?? [])]
        })

        const total = project.xperts.length
        const xperts = params?.take ? project.xperts.slice(params.skip, params.skip + params.take) : project.xperts

        return {
            items: xperts.map((_) => new XpertIdentiDto(_)),
            total
        }
    }

    async addXpert(id: string, xpertId: string) {
        const project = await this.findOne({
            where: { id },
            relations: ['xperts']
        })

        const xpertExists = project.xperts.some((xpert) => xpert.id === xpertId)
        if (xpertExists) {
            this.#logger.warn(`Xpert with id ${xpertId} already exists in project ${id}`)
            return project
        }

        const xpert = await this.queryBus.execute(new FindXpertQuery({ id: xpertId }))

        project.xperts.push(xpert) // Assuming xpert is an entity with at least an id field
        await this.repository.save(project)

        return project
    }

    async removeXpert(id: string, xpertId: string) {
        const project = await this.findOne({
            where: { id },
            relations: ['xperts']
        })

        const xpertIndex = project.xperts.findIndex((xpert) => xpert.id === xpertId)
        if (xpertIndex === -1) {
            this.#logger.warn(`Xpert with id ${xpertId} does not exist in project ${id}`)
            return project
        }

        project.xperts.splice(xpertIndex, 1)
        await this.repository.save(project)

        return project
    }

    async getToolsets(id: string, params: PaginationParams<IXpertToolset>) {
        const project = await this.findOne({
            where: { id },
            relations: ['toolsets', ...(params?.relations?.map((relation) => `toolsets.${relation}`) ?? [])]
        })

        const total = project.toolsets.length
        const toolsets = params?.take
            ? project.toolsets.slice(params.skip, params.skip + params.take)
            : project.toolsets

        return {
            items: toolsets.map((_) => new ToolsetPublicDTO(_)),
            total
        }
    }

    async addToolset(id: string, toolsetId: string) {
        const project = await this.findOne({
            where: { id },
            relations: ['toolsets']
        })

        const exists = project.toolsets.some((_) => _.id === toolsetId)
        if (exists) {
            this.#logger.warn(`Toolset with id ${toolsetId} already exists in project ${id}`)
            return project
        }

        const toolsets = await this.queryBus.execute(new FindXpertToolsetsQuery([toolsetId]))

        project.toolsets.push(...toolsets) // Assuming toolset is an entity with at least an id field
        await this.repository.save(project)

        return project
    }

    async removeToolset(id: string, toolsetId: string) {
        const project = await this.findOne({
            where: { id },
            relations: ['toolsets']
        })

        const index = project.toolsets.findIndex((_) => _.id === toolsetId)
        if (index === -1) {
            this.#logger.warn(`Toolset with id ${toolsetId} does not exist in project ${id}`)
            return project
        }

        project.toolsets.splice(index, 1)
        await this.repository.save(project)

        return project
    }

    async getKnowledges(id: string, params: PaginationParams<IKnowledgebase>) {
        const project = await this.findOne({
            where: { id },
            relations: ['knowledges', ...(params?.relations?.map((relation) => `knowledges.${relation}`) ?? [])]
        })

        const total = project.knowledges.length
        const knowledges = params?.take
            ? project.knowledges.slice(params.skip, params.skip + params.take)
            : project.knowledges

        return {
            items: knowledges.map((_) => new KnowledgebasePublicDTO(_)),
            total
        }
    }

    async addKnowledge(id: string, knowledgebaseId: string) {
        const project = await this.findOne({
            where: { id },
            relations: ['knowledges']
        })

        const exists = project.knowledges.some((_) => _.id === knowledgebaseId)
        if (exists) {
            this.#logger.warn(`Knowledgebase with id ${knowledgebaseId} already exists in project ${id}`)
            return project
        }

        const knowledgebase = await this.queryBus.execute(new KnowledgebaseGetOneQuery({ id: knowledgebaseId }))

        project.knowledges.push(knowledgebase)
        await this.repository.save(project)

        return project
    }

    async removeKnowledgebase(id: string, knowledgebaseId: string) {
        const project = await this.findOne({
            where: { id },
            relations: ['knowledges']
        })

        const index = project.knowledges.findIndex((_) => _.id === knowledgebaseId)
        if (index === -1) {
            this.#logger.warn(`Knowledgebase with id ${knowledgebaseId} does not exist in project ${id}`)
            return project
        }

        project.knowledges.splice(index, 1)
        await this.repository.save(project)

        return project
    }

    async updateMembers(id: string, members: string[]) {
        const project = await this.findOne(id)
        project.members = members.map((id) => ({ id }) as IUser)
        await this.repository.save(project)

        return await this.findOne(id, { relations: ['members'] })
    }

    async getTasks(id: string, params: PaginationParams<XpertProjectTask>) {
        return this.taskService.findAll({
            ...(params ?? {}),
            where: {
                ...(params?.where ?? {}),
                projectId: id
            },
            order: { createdAt: OrderTypeEnum.ASC }
        })
    }

    createTasks(id: string, task: Partial<IXpertProjectTask>) {
        return this.taskService.createTask(id, task)
    }

    updateTask(id: string, taskId: string, task: Partial<IXpertProjectTask>) {
        return this.taskService.updateTask(id, taskId, task)
    }

    batchUpdateTasks(
        id: string,
        input: {
            ids: string[]
            status?: IXpertProjectTask['status']
            assigneeId?: string
            priority?: IXpertProjectTask['priority']
        }
    ) {
        return this.taskService.batchUpdate(id, input)
    }

    reorderTasks(id: string, items: Array<{ id: string; order: number; column?: string }>) {
        return this.taskService.reorder(id, items)
    }

    getTaskRelations(id: string, taskId: string) {
        return this.taskService.listTaskRelations(id, taskId)
    }

    linkTaskConversation(
        id: string,
        taskId: string,
        input: Pick<IXpertProjectTaskConversation, 'conversationId' | 'relationType'> &
            Partial<IXpertProjectTaskConversation>
    ) {
        return this.taskService.linkConversation(id, taskId, input)
    }

    createTaskExecution(id: string, taskId: string, input: Partial<IXpertProjectTaskExecution>) {
        return this.taskService.createExecution(id, taskId, input)
    }

    updateTaskExecution(id: string, taskId: string, executionId: string, input: Partial<IXpertProjectTaskExecution>) {
        return this.taskService.updateExecution(id, taskId, executionId, input)
    }

    // async getFiles(id: string, params?: PaginationParams<IXpertProjectFile>) {
    // 	const project = await this.findOne(id, { relations: ['files', 'attachments'] })

    // 	return [
    // 		...project.files,
    // 		...project.attachments.map(
    // 			(storageFile) =>
    // 				({
    // 					filePath: `attachments/` + storageFile.originalName,
    // 					url: storageFile.fileUrl,
    // 					storageFileId: storageFile.id
    // 				}) as TFile
    // 		)
    // 	]
    // }

    // async getFileByPath(projectId: string, path: string) {
    // 	if (path.startsWith('attachments/')) {
    // 		const project = await this.findOne(projectId, { relations: ['attachments'] })
    // 		const storageFile = project.attachments.find((_) => _.originalName === path.replace(/^attachments\//, ''))
    // 		if (storageFile) {
    // 			const docs = await this.commandBus.execute<LoadStorageFileCommand, Document[]>(
    // 				new LoadStorageFileCommand(storageFile.id)
    // 			)
    // 			return {
    // 				filePath: path,
    // 				contents: docs.map((doc) => doc.pageContent).join('\n\n'),
    // 				url: storageFile.fileUrl,
    // 				fileType: storageFile.mimetype,
    // 				size: storageFile.size,
    // 				description: ''
    // 			}
    // 		}
    // 	}
    // 	const result = await this.fileService.findOneOrFail({ where: { projectId, filePath: path } })
    // 	return result.record
    // }

    async addAttachments(id: string, files: string[]) {
        const project = await this.findOne(id, { relations: ['attachments'] })
        const existingAttachmentIds = new Set(project.attachments.map((attachment) => attachment.id))

        const newAttachments = files
            .filter((fileId) => !existingAttachmentIds.has(fileId))
            .map((fileId) => ({ id: fileId }) as IStorageFile)

        project.attachments = [...project.attachments, ...newAttachments]
        await this.repository.save(project)
    }

    async removeAttachments(id: string, files: string[]) {
        const project = await this.findOne(id, { relations: ['attachments'] })
        project.attachments = project.attachments.filter((attachment) => !files.includes(attachment.id))
        await this.repository.save(project)
    }

    async delAttachment(id: string, fileId: string) {
        const project = await this.findOne(id, { relations: ['attachments'] })
        const index = project.attachments.findIndex((_) => _.id === fileId)
        if (index > -1) {
            project.attachments.splice(index, 1)
            await this.repository.save(project)
            await this.commandBus.execute(new StorageFileDeleteCommand(fileId))
        }
    }

    async duplicate(id: string): Promise<XpertProject> {
        const project = await this.findOne(id, {
            relations: ['copilotModel', 'xperts', 'toolsets', 'knowledges', 'attachments']
        })

        const duplicate = await this.create({
            ...project,
            id: undefined, // Clear the ID to create a new project
            tenantId: undefined,
            organizationId: undefined,
            createdAt: undefined,
            updatedAt: undefined,
            createdById: undefined,
            updatedById: undefined,
            name: `${project.name} - Copy`,
            status: 'active',
            xperts: project.xperts.map((xpert) => ({ id: xpert.id })),
            toolsets: project.toolsets.map((toolset) => ({ id: toolset.id })),
            knowledges: project.knowledges.map((knowledge) => ({ id: knowledge.id })),
            attachments: project.attachments.map((_) => ({ id: _.id }))
        })

        const planRepository = this.repository.manager.getRepository(XpertProjectPlan)
        const taskRepository = this.repository.manager.getRepository(XpertProjectTask)
        const milestoneRepository = this.repository.manager.getRepository(XpertProjectMilestone)
        const assetRepository = this.repository.manager.getRepository(XpertProjectAsset)
        const automationRepository = this.repository.manager.getRepository(XpertProjectAutomation)
        const plans = await planRepository.find({ where: { projectId: id }, relations: ['milestones'] })
        const planIds = new Map<string, string>()
        for (const plan of plans) {
            const copiedPlan = await planRepository.save(
                planRepository.create({
                    projectId: duplicate.id,
                    name: plan.name,
                    description: plan.description,
                    status: plan.status,
                    view: plan.view,
                    startDate: plan.startDate,
                    dueDate: plan.dueDate,
                    order: plan.order,
                    tenantId: duplicate.tenantId,
                    organizationId: duplicate.organizationId,
                    createdById: duplicate.createdById
                })
            )
            planIds.set(plan.id, copiedPlan.id)
            for (const milestone of plan.milestones ?? []) {
                await milestoneRepository.save(
                    milestoneRepository.create({
                        projectId: duplicate.id,
                        planId: copiedPlan.id,
                        name: milestone.name,
                        description: milestone.description,
                        status: milestone.status,
                        dueDate: milestone.dueDate,
                        order: milestone.order,
                        tenantId: duplicate.tenantId,
                        organizationId: duplicate.organizationId,
                        createdById: duplicate.createdById
                    })
                )
            }
        }
        const tasks = await taskRepository.find({ where: { projectId: id } })
        for (const task of tasks) {
            await taskRepository.save(
                taskRepository.create({
                    ...task,
                    id: undefined,
                    projectId: duplicate.id,
                    planId: task.planId ? planIds.get(task.planId) : undefined,
                    tenantId: duplicate.tenantId,
                    organizationId: duplicate.organizationId,
                    createdById: duplicate.createdById,
                    updatedById: undefined
                })
            )
        }
        const assets = await assetRepository.find({ where: { projectId: id } })
        for (const asset of assets) {
            await assetRepository.save(
                assetRepository.create({
                    ...asset,
                    id: undefined,
                    projectId: duplicate.id,
                    tenantId: duplicate.tenantId,
                    organizationId: duplicate.organizationId,
                    createdById: duplicate.createdById,
                    updatedById: undefined
                })
            )
        }
        const automations = await automationRepository.find({ where: { projectId: id } })
        for (const automation of automations) {
            await automationRepository.save(
                automationRepository.create({
                    ...automation,
                    id: undefined,
                    projectId: duplicate.id,
                    tenantId: duplicate.tenantId,
                    organizationId: duplicate.organizationId,
                    createdById: duplicate.createdById,
                    updatedById: undefined,
                    lastRunAt: undefined,
                    nextRunAt: undefined
                })
            )
        }
        return duplicate
    }

    async exportProject(id: string) {
        const projectDsl = await this.commandBus.execute(new ExportProjectCommand(id))
        const project = await this.findOne(id)
        const [plans, tasks, milestones, assets, automations] = await Promise.all([
            this.repository.manager.getRepository(XpertProjectPlan).find({ where: { projectId: id } }),
            this.repository.manager.getRepository(XpertProjectTask).find({ where: { projectId: id } }),
            this.repository.manager.getRepository(XpertProjectMilestone).find({ where: { projectId: id } }),
            this.repository.manager.getRepository(XpertProjectAsset).find({ where: { projectId: id } }),
            this.repository.manager.getRepository(XpertProjectAutomation).find({ where: { projectId: id } })
        ])
        return yaml.stringify({
            version: 2,
            project: projectDsl?.project ?? project,
            plans,
            tasks,
            milestones,
            assets,
            automations
        })
    }

    async importProject(input: unknown): Promise<XpertProject> {
        const parsed = typeof input === 'string' ? yaml.parse(input) : input
        if (!parsed || typeof parsed !== 'object') throw new BadRequestException('Invalid project DSL')
        const root = parsed as Record<string, unknown>
        const source =
            root.project && typeof root.project === 'object' ? (root.project as Record<string, unknown>) : root
        const name = typeof source.name === 'string' ? source.name.trim() : ''
        if (!name) throw new BadRequestException('Project DSL requires a name')
        const project = await this.create({
            name,
            description: typeof source.description === 'string' ? source.description : undefined,
            avatar: source.avatar as XpertProject['avatar'],
            status: 'active',
            settings: source.settings as XpertProject['settings']
        })
        const planRepository = this.repository.manager.getRepository(XpertProjectPlan)
        const milestoneRepository = this.repository.manager.getRepository(XpertProjectMilestone)
        const taskRepository = this.repository.manager.getRepository(XpertProjectTask)
        const taskStepRepository = this.repository.manager.getRepository(XpertProjectTaskStep)
        const assetRepository = this.repository.manager.getRepository(XpertProjectAsset)
        const automationRepository = this.repository.manager.getRepository(XpertProjectAutomation)
        const planIdMap = new Map<string, string>()
        const milestoneIdMap = new Map<string, string>()
        const plans = (root.plans ?? source.plans) as Array<Record<string, unknown>> | undefined
        for (const inputPlan of Array.isArray(plans) ? plans : []) {
            const plan = await planRepository.save(
                planRepository.create({
                    projectId: project.id,
                    name: typeof inputPlan.name === 'string' ? inputPlan.name : 'Untitled plan',
                    description: typeof inputPlan.description === 'string' ? inputPlan.description : undefined,
                    status: (inputPlan.status as XpertProjectPlan['status']) ?? 'active',
                    view: (inputPlan.view as XpertProjectPlan['view']) ?? 'board',
                    startDate: inputPlan.startDate ? new Date(String(inputPlan.startDate)) : undefined,
                    dueDate: inputPlan.dueDate ? new Date(String(inputPlan.dueDate)) : undefined,
                    order: typeof inputPlan.order === 'number' ? inputPlan.order : 0,
                    tenantId: project.tenantId,
                    organizationId: project.organizationId,
                    createdById: project.createdById
                })
            )
            if (typeof inputPlan.id === 'string') planIdMap.set(inputPlan.id, plan.id)
        }
        if (!Array.isArray(plans) || plans.length === 0) {
            const defaultPlan = await planRepository.save(
                planRepository.create({
                    projectId: project.id,
                    name: 'Default plan',
                    description: 'Project delivery plan',
                    status: 'active',
                    view: 'board',
                    order: 0,
                    tenantId: project.tenantId,
                    organizationId: project.organizationId,
                    createdById: project.createdById
                })
            )
            await milestoneRepository.save(
                milestoneRepository.create({
                    projectId: project.id,
                    planId: defaultPlan.id,
                    name: 'Uncategorized',
                    status: 'planned',
                    order: 0,
                    tenantId: project.tenantId,
                    organizationId: project.organizationId,
                    createdById: project.createdById
                })
            )
        }
        const milestones = (root.milestones ?? source.milestones) as Array<Record<string, unknown>> | undefined
        for (const inputMilestone of Array.isArray(milestones) ? milestones : []) {
            const rawPlanId = typeof inputMilestone.planId === 'string' ? inputMilestone.planId : undefined
            const planId =
                (rawPlanId && planIdMap.get(rawPlanId)) ||
                (await planRepository.findOne({ where: { projectId: project.id }, order: { order: 'ASC' } }))?.id
            if (!planId) continue
            const milestone = await milestoneRepository.save(
                milestoneRepository.create({
                    projectId: project.id,
                    planId,
                    name: typeof inputMilestone.name === 'string' ? inputMilestone.name : 'Uncategorized',
                    description:
                        typeof inputMilestone.description === 'string' ? inputMilestone.description : undefined,
                    status: (inputMilestone.status as 'planned' | 'in_progress' | 'completed' | 'blocked') ?? 'planned',
                    dueDate: inputMilestone.dueDate ? new Date(String(inputMilestone.dueDate)) : undefined,
                    order: typeof inputMilestone.order === 'number' ? inputMilestone.order : 0,
                    tenantId: project.tenantId,
                    organizationId: project.organizationId,
                    createdById: project.createdById
                })
            )
            if (typeof inputMilestone.id === 'string') milestoneIdMap.set(inputMilestone.id, milestone.id)
        }
        const tasks = root.tasks as Array<Record<string, unknown>> | undefined
        for (const inputTask of Array.isArray(tasks) ? tasks : []) {
            const rawPlanId = typeof inputTask.planId === 'string' ? inputTask.planId : undefined
            const rawMilestoneId = typeof inputTask.milestoneId === 'string' ? inputTask.milestoneId : undefined
            const task = await taskRepository.save(
                taskRepository.create({
                    projectId: project.id,
                    threadId: typeof inputTask.threadId === 'string' ? inputTask.threadId : undefined,
                    name:
                        typeof inputTask.name === 'string'
                            ? inputTask.name
                            : typeof inputTask.title === 'string'
                              ? inputTask.title
                              : 'Untitled task',
                    title:
                        typeof inputTask.title === 'string'
                            ? inputTask.title
                            : typeof inputTask.name === 'string'
                              ? inputTask.name
                              : 'Untitled task',
                    description: typeof inputTask.description === 'string' ? inputTask.description : undefined,
                    type: typeof inputTask.type === 'string' ? inputTask.type : undefined,
                    status: normalizeImportedTaskStatus(inputTask.status),
                    priority: (inputTask.priority as IXpertProjectTask['priority']) ?? 'medium',
                    assigneeId: typeof inputTask.assigneeId === 'string' ? inputTask.assigneeId : undefined,
                    dueDate: inputTask.dueDate ? new Date(String(inputTask.dueDate)) : undefined,
                    planId: rawPlanId ? planIdMap.get(rawPlanId) : undefined,
                    milestoneId: rawMilestoneId ? milestoneIdMap.get(rawMilestoneId) : undefined,
                    column: typeof inputTask.column === 'string' ? inputTask.column : undefined,
                    order: typeof inputTask.order === 'number' ? inputTask.order : 0,
                    tenantId: project.tenantId,
                    organizationId: project.organizationId,
                    createdById: project.createdById
                })
            )
            const steps = inputTask.steps as Array<Record<string, unknown>> | undefined
            if (Array.isArray(steps) && steps.length) {
                await taskStepRepository.save(
                    steps.map((inputStep, index) =>
                        taskStepRepository.create({
                            taskId: task.id,
                            stepIndex: typeof inputStep.stepIndex === 'number' ? inputStep.stepIndex : index,
                            description: typeof inputStep.description === 'string' ? inputStep.description : '',
                            notes: typeof inputStep.notes === 'string' ? inputStep.notes : '',
                            status: (inputStep.status as 'pending' | 'running' | 'done' | 'failed') ?? 'pending',
                            tenantId: project.tenantId,
                            organizationId: project.organizationId,
                            createdById: project.createdById
                        })
                    )
                )
            }
        }
        const assets = (root.assets ?? source.assets) as Array<Record<string, unknown>> | undefined
        for (const inputAsset of Array.isArray(assets) ? assets : []) {
            await assetRepository.save(
                assetRepository.create({
                    projectId: project.id,
                    name: typeof inputAsset.name === 'string' ? inputAsset.name : 'Untitled asset',
                    path: typeof inputAsset.path === 'string' ? inputAsset.path : String(inputAsset.name ?? ''),
                    kind: inputAsset.kind === 'folder' ? 'folder' : 'file',
                    mimeType: typeof inputAsset.mimeType === 'string' ? inputAsset.mimeType : undefined,
                    size: typeof inputAsset.size === 'number' ? inputAsset.size : undefined,
                    source: (inputAsset.source as 'upload' | 'ai_output' | 'conversation' | 'import') ?? 'import',
                    status: 'available',
                    tenantId: project.tenantId,
                    organizationId: project.organizationId,
                    createdById: project.createdById
                })
            )
        }
        const automations = (root.automations ?? source.automations) as Array<Record<string, unknown>> | undefined
        for (const inputAutomation of Array.isArray(automations) ? automations : []) {
            if (!inputAutomation.trigger || !Array.isArray(inputAutomation.actions)) continue
            await automationRepository.save(
                automationRepository.create({
                    projectId: project.id,
                    name: typeof inputAutomation.name === 'string' ? inputAutomation.name : 'Imported automation',
                    enabled: inputAutomation.enabled === true,
                    trigger: inputAutomation.trigger,
                    actions: inputAutomation.actions,
                    tenantId: project.tenantId,
                    organizationId: project.organizationId,
                    createdById: project.createdById
                })
            )
        }
        return project
    }

    // VCS
    async updateVCS(id: string, entity: Partial<IXpertProjectVCS>) {
        const project = await this.findOne(id, { relations: ['vcs'] })
        if (project) {
            project.vcs = { ...(project.vcs ?? {}), ...entity }
            await this.repository.save(project)
        }

        return project?.vcs
    }

    @OnEvent(EventNameIntegrationAuthorized)
    async handleIntegrationAuthorizedEvent(event: IntegrationAuthorizedEvent) {
        console.log('Integration Authorized:', event)
        if (!event.payload.projectId) return
        const project = await this.findOne(event.payload.projectId, { relations: ['vcs'] })
        if (project) {
            const entity: Partial<IXpertProjectVCS> = {
                auth: { ...(project.vcs.auth ?? {}), ...omit(event.payload, ['projectId']) }
            }
            if (event.payload.installation_id) {
                entity.installationId = event.payload.installation_id
            }
            await this.updateVCS(event.payload.projectId, entity)
        }
    }
}

/** Normalize provisioning text before it reaches Project persistence. */
function requiredProjectText(value: string, field: string, maxLength: number): string {
    const normalized = value?.trim()
    if (!normalized || normalized.length > maxLength) {
        throw new BadRequestException(`${field} is required and must not exceed ${maxLength} characters`)
    }
    return normalized
}

function normalizeImportedTaskStatus(value: unknown): IXpertProjectTask['status'] {
    switch (value) {
        case 'pending':
        case 'todo':
            return 'todo'
        case 'in_progress':
            return 'in_progress'
        case 'completed':
        case 'done':
            return 'done'
        case 'failed':
        case 'blocked':
            return 'blocked'
        case 'review':
            return 'review'
        case 'cancelled':
            return 'cancelled'
        default:
            return 'todo'
    }
}
