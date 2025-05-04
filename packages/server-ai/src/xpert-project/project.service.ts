import { IStorageFile, IUser, IXpertProject, IXpertProjectFile, IXpertProjectTask, IXpertToolset, OrderTypeEnum, TFile } from '@metad/contracts'
import { PaginationParams, RequestContext, StorageFileDeleteCommand, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { Document } from 'langchain/document'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, Repository } from 'typeorm'
import { FindXpertToolsetsQuery } from '../xpert-toolset'
import { ToolsetPublicDTO } from '../xpert-toolset/dto'
import { XpertIdentiDto } from '../xpert/dto'
import { FindXpertQuery } from '../xpert/queries'
import { XpertProjectDto } from './dto'
import { XpertProject } from './entities/project.entity'
import { XpertProjectTaskService, XpertProjectFileService } from './services/'
import { LoadStorageFileCommand } from '../shared'

@Injectable()
export class XpertProjectService extends TenantOrganizationAwareCrudService<XpertProject> {
	readonly #logger = new Logger(XpertProjectService.name)

	constructor(
		@InjectRepository(XpertProject)
		repository: Repository<XpertProject>,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly taskService: XpertProjectTaskService,
		private readonly fileService: XpertProjectFileService,
	) {
		super(repository)
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
			.andWhere('project.organizationId = :organizationId')
			.andWhere(
				new Brackets((qb) => {
					qb.where(`project.status <> 'archived'`).orWhere(`project.status IS NULL`)
				})
			)
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
				organizationId,
				userId: user.id
			})

		const projects = await query.getMany()

		return {
			items: projects.map((item) => new XpertProjectDto(item)),
			total: projects.length
		}
	}

	async getXperts(id: string, params: PaginationParams<IXpertProject>) {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const project = await this.repository.findOne({
			where: {
				id,
				tenantId,
				organizationId
			},
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
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const project = await this.repository.findOne({
			where: {
				id,
				tenantId,
				organizationId
			},
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

	async updateMembers(id: string, members: string[]) {
		const project = await this.findOne(id)
		project.members = members.map((id) => ({ id }) as IUser)
		await this.repository.save(project)

		return await this.findOne(id, { relations: ['members'] })
	}

	async getTasks(id: string, params: PaginationParams<IXpertProjectTask>) {
		return this.taskService.findAll({
			...(params ?? {}),
			where: {
				...(params?.where ?? {}),
				projectId: id
			},
			order: { createdAt: OrderTypeEnum.ASC }
		})
	}

	async getFiles(id: string, params?: PaginationParams<IXpertProjectFile>) {
		const project = await this.findOne(id, {relations: ['files', 'attachments']})

		return [...project.files, ...project.attachments.map((storageFile) => ({
			filePath: `attachments/` + storageFile.originalName,
			url: storageFile.fileUrl,
			storageFileId: storageFile.id
		} as TFile))]
	}

	async getFileByPath(projectId: string, path: string) {
		if (path.startsWith('attachments/')) {
			const project = await this.findOne(projectId, {relations: ['attachments']})
			const storageFile = project.attachments.find((_) => _.originalName === path.replace(/^attachments\//, ''))
			if (storageFile) {
				const docs = await this.commandBus.execute<LoadStorageFileCommand, Document[]>(new LoadStorageFileCommand(storageFile.id))
				return {
					filePath: path,
					contents: docs.map((doc) => doc.pageContent).join('\n\n'),
					url: storageFile.fileUrl,
					fileType: storageFile.mimetype,
					size: storageFile.size,
					description: ''
				}
			}
		}
		const result = await this.fileService.findOneOrFail({where: {projectId, filePath: path}})
		return result.record
	}

	async addAttachments(id: string, files: string[]) {
		const project = await this.findOne(id, { relations: ['attachments'] })
		const existingAttachmentIds = new Set(project.attachments.map((attachment) => attachment.id))
		
		const newAttachments = files
			.filter((fileId) => !existingAttachmentIds.has(fileId))
			.map((fileId) => ({ id: fileId } as IStorageFile))
		
		project.attachments = [...project.attachments, ...newAttachments]
		await this.repository.save(project)
	}

	async removeAttachments(id: string, files: string[]) {
		const project = await this.findOne(id, { relations: ['attachments'] })
		project.attachments = project.attachments.filter(
			(attachment) => !files.includes(attachment.id)
		)
		await this.repository.save(project)
	}

	async delAttachment(id: string, fileId: string) {
		const project = await this.findOne(id, { relations: ['attachments'] })
		const index = project.attachments.findIndex((_) => _.id === fileId)
		if (index > -1) {
			const files = project.attachments.splice(index, 1)
			await this.repository.save(project)
			await this.commandBus.execute(new StorageFileDeleteCommand(fileId))
		}
	}
}
