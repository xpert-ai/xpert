import {
    AIPermissionsEnum,
    IKnowledgebase,
    IUser,
    IXpertProject,
    IXpertProjectCreateInput,
    IXpertProjectTaskConversation,
    IXpertProjectTaskExecution,
    IXpertProjectTask,
    IXpertProjectVCS,
    IXpertToolset,
    IXpert,
    OrderTypeEnum,
    ScheduleTaskStatus
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
import { omit } from 'lodash'
import { Brackets, DeepPartial, In, IsNull, Repository } from 'typeorm'
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
import { XpertProjectMembership } from './entities/project-membership.entity'
import { XpertProjectTaskService } from './services/'
import { KnowledgebasePublicDTO } from '../knowledgebase/dto'
import { KnowledgebaseGetOneQuery } from '../knowledgebase/queries'
import { ExportProjectCommand } from './commands'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertProjectAccessService } from './services/project-access.service'
import { XpertProjectContentService } from './services/project-content.service'
import { XpertTask } from '../xpert-task/xpert-task.entity'
import { t } from 'i18next'
import { ProjectUpdateInputDTO } from './dto'
import { ConnectorService } from '../connector/connector.service'
import { XpertProjectXpertBindingService } from './services/project-xpert-binding.service'
import { GetOwnedStorageFileQuery } from '../file-understanding/queries'

@Injectable()
export class XpertProjectService extends TenantOrganizationAwareCrudService<XpertProject> {
    readonly #logger = new Logger(XpertProjectService.name)

    constructor(
        @InjectRepository(XpertProject)
        repository: Repository<XpertProject>,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly taskService: XpertProjectTaskService,
        private readonly accessService: XpertProjectAccessService,
        private readonly contentService: XpertProjectContentService,
        private readonly publishedXpertAccess: PublishedXpertAccessService,
        private readonly connectorService: ConnectorService,
        private readonly xpertBindingService: XpertProjectXpertBindingService
    ) {
        super(repository)
    }

    /** Create from the ordinary authenticated API without accepting persisted identity fields. */
    async createProject(input: IXpertProjectCreateInput) {
        return this.create({
            name: input.name,
            avatar: input.avatar,
            description: input.description,
            status: input.status ?? 'active',
            settings: input.settings,
            copilotModelId: input.copilotModelId,
            vcsId: input.vcsId
        })
    }

    public async create(entity: DeepPartial<XpertProject>, ...options: unknown[]): Promise<XpertProject> {
        const settings = entity.settings as IXpertProject['settings'] | undefined
        const project = await super.create(
            {
                ...omit(entity, [
                    'workspace',
                    'workspaceId',
                    'xperts',
                    'members',
                    'memberships',
                    'toolsets',
                    'knowledges'
                ]),
                ...(settings
                    ? {
                          settings: {
                              instruction: settings.instruction ?? '',
                              mode: settings.mode,
                              managementMode: settings.managementMode
                          }
                      }
                    : {}),
                ownerId: RequestContext.currentUserId()
            },
            ...options
        )
        await this.contentService.initialize(project)
        return project
    }

    /**
     * Create or reconcile a caller-idempotent Chat Project and Assistant link.
     * The authenticated user remains the owner and the caller-supplied id is never replaced.
     */
    async ensureManagedProject(input: ProjectEnsureInput): Promise<ProjectEnsureResult> {
        const projectId = requiredProjectText(input.projectId, 'projectId', 100)
        const xpertId = requiredProjectText(input.xpertId, 'xpertId', 100)
        const name = requiredProjectText(input.name, 'name', 240)
        const user = RequestContext.currentUser()
        if (!user?.id || !user.tenantId) {
            throw new ForbiddenException(
                t('server-ai:Error.AuthenticatedUserRequired', { defaultValue: 'An authenticated user is required' })
            )
        }

        const organizationId = RequestContext.getOrganizationId()
        const xpert = await this.resolveAccessibleCurrentXpert(xpertId)
        if ((xpert.organizationId ?? null) !== (organizationId ?? null)) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectXpertOrganizationMismatch', {
                    defaultValue: 'The Xpert must belong to the Project Organization'
                })
            )
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
            throw new ForbiddenException(
                t('server-ai:Error.ProjectOwnerSyncRequired', {
                    defaultValue: 'Only the Project owner can synchronize this Project'
                })
            )
        }
        if (!project) {
            project = await this.create({
                id: projectId,
                name,
                status: input.status,
                ownerId: user.id
            })
            project.xperts = [xpert]
            project = await this.repository.save(project)
        } else {
            // Bid/business state is authoritative while existing Assistant
            // connections are preserved and de-duplicated.
            project.name = name
            project.status = input.status
            project.xperts ??= []
            await this.xpertBindingService.normalize(project)
            if (!this.xpertBindingService.contains(project, xpert)) {
                project.xperts.push(xpert)
            }
            project = await this.repository.save(project)
        }

        return {
            projectId: project.id,
            // Compatibility only: provisioning clients still carry a Workspace id,
            // but Project persistence and runtime no longer use it.
            workspaceId: input.workspaceId,
            xpertIds: project.xperts?.map((item) => item.id) ?? [xpert.id],
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

    public async update(id: string, input: ProjectUpdateInputDTO): Promise<XpertProject> {
        const project = await this.findOne(id)
        const nextMode = input.settings?.managementMode
        if (project.settings?.managementMode === 'advanced' && nextMode === 'simple') {
            throw new BadRequestException(
                t('server-ai:Error.ProjectAdvancedModeDowngradeUnsupported', {
                    defaultValue: 'Advanced Projects cannot be downgraded to simple mode.'
                })
            )
        }

        if (input.name !== undefined) project.name = input.name
        if (input.avatar !== undefined) project.avatar = input.avatar
        if (input.description !== undefined) project.description = input.description
        if (input.settings) {
            project.settings = {
                ...(project.settings ?? { instruction: '' }),
                ...(input.settings.mode !== undefined ? { mode: input.settings.mode } : {}),
                ...(input.settings.managementMode !== undefined
                    ? { managementMode: input.settings.managementMode }
                    : {})
            }
        }
        return await this.repository.save(project)
    }

    async archive(id: string): Promise<XpertProject> {
        const project = await this.findOne(id)
        project.status = 'archived'
        return this.repository.save(project)
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
    async findAllMy(options: Partial<PaginationParams<XpertProject>> = {}) {
        const user = RequestContext.currentUser()
        const organizationId = RequestContext.getOrganizationId()
        const requestedStatus = !Array.isArray(options?.where) ? options?.where?.status : undefined

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
        await this.repository.manager.getRepository(XpertTask).update(
            { projectId: id, xpertId: In([...new Set(taskXpertIds)]) },
            {
                status: ScheduleTaskStatus.PAUSED,
                statusReason: t('server-ai:Error.ProjectTaskXpertRemoved', {
                    defaultValue: 'The scheduled Xpert is no longer part of this Project'
                })
            }
        )

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
            relations: ['toolsets']
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

    async addToolset(_id: string, _toolsetId: string) {
        throw new BadRequestException(
            t('server-ai:Error.ProjectToolsetBindingDeprecated', {
                defaultValue: 'Projects no longer bind Toolsets directly; configure the Project Xperts instead'
            })
        )
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
            relations: ['knowledges']
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

    async addKnowledge(_id: string, _knowledgebaseId: string) {
        throw new BadRequestException(
            t('server-ai:Error.ProjectKnowledgebaseBindingDeprecated', {
                defaultValue: 'Projects no longer bind Knowledgebases directly; configure the Project Xperts instead'
            })
        )
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

    async updateMembers(_id: string, _members: string[]) {
        throw new BadRequestException(
            t('server-ai:Error.ProjectMembershipApiRequired', {
                defaultValue: 'Use the Project membership API to manage members'
            })
        )
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
            relations: ['copilotModel', 'xperts', 'attachments']
        })

        const { content: instruction } = await this.contentService.readInstructions(id)
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
            settings: {
                instruction,
                mode: project.settings?.mode,
                managementMode: project.settings?.managementMode
            },
            attachments: project.attachments.map((_) => ({ id: _.id }))
        })
        for (const xpert of project.xperts) await this.addXpert(duplicate.id, xpert.id)

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
