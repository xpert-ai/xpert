import {
    AIPermissionsEnum,
    IKnowledgebase,
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
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter'
import { assign, omit } from 'lodash'
import { Brackets, DeepPartial, IsNull, Repository } from 'typeorm'
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
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { XpertWorkspaceService } from '../xpert-workspace/workspace.service'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { XpertProjectTaskExecution } from './entities/project-task-execution.entity'
import { XpertProjectMembership } from './entities/project-membership.entity'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertProjectAccessService } from './services/project-access.service'
import { XpertProjectXpertBindingService } from './services/project-xpert-binding.service'
import { GetOwnedStorageFileQuery } from '../file-understanding/queries'
import { t } from 'i18next'
import { ConnectorService } from '../connector/connector.service'

@Injectable()
export class XpertProjectService extends TenantOrganizationAwareCrudService<XpertProject> {
    readonly #logger = new Logger(XpertProjectService.name)

    constructor(
        @InjectRepository(XpertProject)
        repository: Repository<XpertProject>,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly taskService: XpertProjectTaskService,
        private readonly workspaceAccessService: XpertWorkspaceAccessService,
        private readonly workspaceService: XpertWorkspaceService,
        private readonly accessService: XpertProjectAccessService,
        private readonly publishedXpertAccess: PublishedXpertAccessService,
        private readonly connectorService: ConnectorService,
        private readonly eventEmitter: EventEmitter2,
        private readonly xpertBindingService: XpertProjectXpertBindingService
    ) {
        super(repository)
    }

    /**
     * New Projects always receive an authoring Workspace. Legacy Projects may
     * still have a null workspaceId until they are explicitly repaired.
     */
    public async create(entity: DeepPartial<XpertProject>, ...options: unknown[]): Promise<XpertProject> {
        const workspace = await this.resolveAuthoringWorkspace(entity.workspaceId as string | undefined)
        return super.create({ ...entity, workspaceId: workspace.id }, ...options)
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
        if (project && project.workspaceId !== workspaceId) {
            await this.assertWorkspaceCanBeBound(project, workspaceId)
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
        const { project } = await this.accessService.assertCanUseXpert(projectId, xpertId)
        await this.publishedXpertAccess.getAccessiblePublishedXpert(xpertId)
        return project
    }

    async assertProjectAccess(projectId: string): Promise<XpertProject> {
        return (await this.accessService.assertCanRead(projectId)).project
    }

    async assertToolPermission(projectId: string, operation: 'view' | 'edit') {
        return (
            await (operation === 'edit'
                ? this.accessService.assertCanEdit(projectId)
                : this.accessService.assertCanRead(projectId))
        ).project
    }

    public async update(id: string, partialEntity: QueryDeepPartialEntity<XpertProject>): Promise<XpertProject> {
        const project = await this.findOne(id)
        const nextMode = (partialEntity.settings as IXpertProject['settings'] | undefined)?.managementMode
        if (project.settings?.managementMode === 'advanced' && nextMode === 'simple') {
            throw new BadRequestException('Advanced projects cannot be downgraded to simple mode')
        }
        if (Object.prototype.hasOwnProperty.call(partialEntity, 'workspaceId')) {
            const nextWorkspaceId =
                typeof partialEntity.workspaceId === 'string' ? partialEntity.workspaceId.trim() : ''
            if (!nextWorkspaceId) {
                throw new BadRequestException('Project Workspace is required')
            }
            if (nextWorkspaceId !== project.workspaceId) {
                await this.assertWorkspaceCanBeBound(project, nextWorkspaceId)
            }
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

    async deleteProject(id: string) {
        const project = await this.findOne(id)
        return this.repository.manager.transaction(async (manager) => {
            await this.connectorService.deleteProjectBindings(
                { projectId: project.id, tenantId: project.tenantId },
                manager
            )
            return manager.getRepository(XpertProject).delete({
                id: project.id,
                tenantId: project.tenantId,
                organizationId: project.organizationId ?? IsNull()
            })
        })
    }

    async softRemoveProject(id: string) {
        const project = await this.findOne(id)
        return this.repository.manager.transaction(async (manager) => {
            await this.connectorService.deleteProjectBindings(
                { projectId: project.id, tenantId: project.tenantId },
                manager
            )
            return manager.getRepository(XpertProject).softRemove(project)
        })
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
            .leftJoin(
                'project.memberships',
                'membership',
                'membership.userId = :userId AND membership.deletedAt IS NULL'
            )
            .where('project.tenantId = :tenantId')
            .andWhere(
                new Brackets((qb) => {
                    qb.where('project.ownerId = :userId').orWhere('membership.userId = :userId')
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

        const [projects, total] = await query.getManyAndCount()

        return {
            items: projects,
            total
        }
    }

    async getXperts(id: string, params: PaginationParams<IXpertProject>) {
        const project = await this.findOne({
            where: { id },
            relations: ['xperts']
        })
        await this.xpertBindingService.normalize(project)

        const total = project.xperts.length
        const xperts = params?.take ? project.xperts.slice(params.skip, params.skip + params.take) : project.xperts

        return {
            items: xperts.map((_) => new XpertIdentiDto(_)),
            total
        }
    }

    async getAvailableXperts(id: string, params: { skip?: number; take?: number } = {}) {
        const { project } = await this.accessService.assertCanManage(id)
        const where = { organizationId: project.organizationId ?? null, latest: true }
        const [items, total] = await Promise.all([
            this.publishedXpertAccess.findAccessiblePublishedXperts({
                where,
                skip: Math.max(params.skip ?? 0, 0),
                take: Math.min(Math.max(params.take ?? 50, 1), 100)
            }),
            this.publishedXpertAccess.countAccessiblePublishedXperts(where)
        ])
        return {
            items: items.map((xpert) => new XpertIdentiDto(xpert)),
            total
        }
    }

    async findAvailableForXpert(input: {
        xpertId: string
        status?: 'active' | 'archived' | 'all'
        skip?: number
        take?: number
    }) {
        const xpert = await this.resolveAccessibleCurrentXpert(input.xpertId)
        const userId = RequestContext.currentUserId()
        const organizationId = RequestContext.getOrganizationId()
        const query = this.repository.createQueryBuilder('project')
        const linkedXpertSubquery = query
            .subQuery()
            .select('1')
            .from(XpertProject, 'linkedProject')
            .innerJoin('linkedProject.xperts', 'linkedXpert')
            .where('linkedProject.id = project.id')
            .andWhere('linkedXpert.tenantId = :xpertTenantId', { xpertTenantId: xpert.tenantId })
            .andWhere('linkedXpert.type = :xpertType', { xpertType: xpert.type })
            .andWhere('linkedXpert.slug = :xpertSlug', { xpertSlug: xpert.slug })
        if (xpert.organizationId) {
            linkedXpertSubquery.andWhere('linkedXpert.organizationId = :xpertOrganizationId', {
                xpertOrganizationId: xpert.organizationId
            })
        } else {
            linkedXpertSubquery.andWhere('linkedXpert.organizationId IS NULL')
        }
        if (xpert.workspaceId) {
            linkedXpertSubquery.andWhere('linkedXpert.workspaceId = :xpertWorkspaceId', {
                xpertWorkspaceId: xpert.workspaceId
            })
        } else {
            linkedXpertSubquery.andWhere('linkedXpert.workspaceId IS NULL')
        }
        const linkedXpertExists = linkedXpertSubquery.getQuery()
        const activeMembershipExists = query
            .subQuery()
            .select('1')
            .from(XpertProjectMembership, 'availableMembership')
            .where('availableMembership.projectId = project.id')
            .andWhere('availableMembership.userId = :userId', { userId })
            .andWhere('availableMembership.deletedAt IS NULL')
            .getQuery()
        query
            .where('project.tenantId = :tenantId', { tenantId: RequestContext.currentTenantId() })
            .andWhere(`EXISTS ${linkedXpertExists}`)
            .andWhere(
                new Brackets((qb) => {
                    qb.where('project.ownerId = :userId').orWhere(`EXISTS ${activeMembershipExists}`)
                })
            )
        if (organizationId) query.andWhere('project.organizationId = :organizationId', { organizationId })
        else query.andWhere('project.organizationId IS NULL')
        if (input.status && input.status !== 'all') query.andWhere('project.status = :status', { status: input.status })
        else if (!input.status) query.andWhere("project.status <> 'archived'")
        query.skip(Math.max(input.skip ?? 0, 0)).take(Math.min(Math.max(input.take ?? 25, 1), 100))
        const [items, total] = await query.getManyAndCount()
        return { items, total }
    }

    async addXpert(id: string, xpertId: string) {
        const { project } = await this.accessService.assertCanManage(id)
        const withXperts = await this.findOne({ where: { id }, relations: ['xperts'] })
        const xpert = await this.resolveAccessibleCurrentXpert(xpertId)
        if ((xpert.organizationId ?? null) !== (project.organizationId ?? null)) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectXpertOrganizationMismatch', {
                    defaultValue: 'The Xpert must belong to the Project Organization'
                })
            )
        }

        await this.xpertBindingService.normalize(withXperts)
        const xpertExists = this.xpertBindingService.contains(withXperts, xpert)
        if (xpertExists) {
            this.#logger.warn(`Xpert with id ${xpertId} already exists in project ${id}`)
            return withXperts
        }

        withXperts.xperts.push(xpert)
        await this.repository.save(withXperts)

        return withXperts
    }

    /** @deprecated Legacy client wrapper. Adds the requested Xpert as a peer; it does not select a default. */
    async setAssistant(id: string, xpertId: string) {
        return this.addXpert(id, xpertId)
    }

    async removeXpert(id: string, xpertId: string) {
        await this.accessService.assertCanManage(id)
        const project = await this.findOne({
            where: { id },
            relations: ['xperts']
        })
        const currentXpert = await this.xpertBindingService.resolveCurrentById(xpertId, {
            tenantId: project.tenantId,
            organizationId: project.organizationId
        })
        const removedXpertIds = project.xperts
            .filter(
                (linkedXpert) =>
                    linkedXpert.id === xpertId ||
                    (currentXpert ? this.xpertBindingService.isSameXpert(linkedXpert, currentXpert) : false)
            )
            .map((linkedXpert) => linkedXpert.id)
        if (removedXpertIds.length === 0) {
            this.#logger.warn(`Xpert with id ${xpertId} does not exist in project ${id}`)
            return project
        }

        project.xperts = project.xperts.filter((linkedXpert) => !removedXpertIds.includes(linkedXpert.id))
        await this.repository.save(project)
        const taskXpertIds = [xpertId, ...removedXpertIds]
        if (currentXpert) taskXpertIds.push(currentXpert.id)
        await this.eventEmitter.emitAsync('xpert-project.xpert-removed', {
            tenantId: project.tenantId,
            organizationId: project.organizationId,
            projectId: id,
            xpertIds: [...new Set(taskXpertIds)]
        })

        return project
    }

    private async resolveAccessibleCurrentXpert(xpertId: string): Promise<IXpert> {
        const requestedXpert = await this.publishedXpertAccess.getAccessiblePublishedXpert(xpertId)
        const currentXpert = await this.xpertBindingService.resolveCurrent(requestedXpert)
        if (currentXpert.id === requestedXpert.id) return requestedXpert

        return this.publishedXpertAccess.getAccessiblePublishedXpert(currentXpert.id)
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

        const toolsets = await this.queryBus.execute(new FindXpertToolsetsQuery([toolsetId]))
        for (const toolset of toolsets) {
            await this.assertResourceWorkspace(project.workspaceId, toolset.workspaceId, 'Toolset')
        }

        const exists = project.toolsets.some((_) => _.id === toolsetId)
        if (exists) {
            this.#logger.warn(`Toolset with id ${toolsetId} already exists in project ${id}`)
            return project
        }

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

        const knowledgebase = await this.queryBus.execute(new KnowledgebaseGetOneQuery({ id: knowledgebaseId }))
        await this.assertResourceWorkspace(project.workspaceId, knowledgebase.workspaceId, 'Knowledgebase')

        const exists = project.knowledges.some((_) => _.id === knowledgebaseId)
        if (exists) {
            this.#logger.warn(`Knowledgebase with id ${knowledgebaseId} already exists in project ${id}`)
            return project
        }

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

    claimTaskExecution(id: string, input: { threadId?: string; xpertId?: string; agentExecutionId: string }) {
        return this.taskService.claimExecution(id, input)
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

        const newAttachmentIds = files.filter((fileId) => !existingAttachmentIds.has(fileId))
        const newAttachments = await Promise.all(
            newAttachmentIds.map((fileId) => this.queryBus.execute(new GetOwnedStorageFileQuery(fileId)))
        )

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
                    assigneeXpertId:
                        typeof inputTask.assigneeXpertId === 'string' ? inputTask.assigneeXpertId : undefined,
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

    private async resolveAuthoringWorkspace(workspaceId?: string) {
        const normalizedWorkspaceId = workspaceId?.trim()
        if (normalizedWorkspaceId) {
            const access = await this.workspaceAccessService.assertCanAuthor(normalizedWorkspaceId)
            return access.workspace
        }

        const workspace = await this.workspaceService.findMyDefault('authoring')
        if (!workspace) {
            throw new BadRequestException(
                'Project Workspace is required. Select an authoring Workspace before creating a Project.'
            )
        }
        return workspace
    }

    private async assertWorkspaceCanBeBound(project: XpertProject, workspaceId: string) {
        const access = await this.workspaceAccessService.assertCanAuthor(workspaceId)
        if (await this.hasProjectRuntimeData(project.id)) {
            throw new BadRequestException(
                'A Project with conversations, executions, tasks, or assets cannot change Workspace. Copy it instead.'
            )
        }

        const [xperts, toolsets, knowledges] = await Promise.all([
            this.repository.findOne({ where: { id: project.id }, relations: ['xperts'] }),
            this.repository.findOne({ where: { id: project.id }, relations: ['toolsets'] }),
            this.repository.findOne({ where: { id: project.id }, relations: ['knowledges'] })
        ])
        for (const xpert of xperts?.xperts ?? []) {
            if (xpert.workspaceId !== access.workspace.id) {
                throw new BadRequestException('All Project Assistants must belong to the selected Workspace')
            }
        }
        for (const toolset of toolsets?.toolsets ?? []) {
            if (toolset.workspaceId !== access.workspace.id) {
                throw new BadRequestException('All Project Toolsets must belong to the selected Workspace')
            }
        }
        for (const knowledge of knowledges?.knowledges ?? []) {
            if (knowledge.workspaceId !== access.workspace.id) {
                throw new BadRequestException('All Project Knowledgebases must belong to the selected Workspace')
            }
        }
    }

    private async assertResourceWorkspace(
        projectWorkspaceId: string | undefined,
        resourceWorkspaceId: string | undefined,
        kind: string
    ) {
        if (!projectWorkspaceId) {
            throw new BadRequestException('Bind a Workspace to the Project before adding resources')
        }
        if (!resourceWorkspaceId || resourceWorkspaceId !== projectWorkspaceId) {
            throw new BadRequestException(`${kind} must belong to the Project Workspace`)
        }
        await this.workspaceAccessService.assertCanRun(projectWorkspaceId)
    }

    private async hasProjectRuntimeData(projectId: string) {
        const manager = this.repository.manager
        const [taskCount, assetCount, executionCount, conversationCount] = await Promise.all([
            manager.getRepository(XpertProjectTask).count({ where: { projectId } }),
            manager.getRepository(XpertProjectAsset).count({ where: { projectId } }),
            manager.getRepository(XpertProjectTaskExecution).count({ where: { projectId } }),
            manager.getRepository(ChatConversation).count({ where: { projectId } })
        ])
        return taskCount > 0 || assetCount > 0 || executionCount > 0 || conversationCount > 0
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
