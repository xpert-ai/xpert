import { IPagination, IUser } from '@xpert-ai/contracts'
import { PaginationParams, RequestContext, TenantOrganizationAwareCrudService, transformWhere } from '@xpert-ai/server-core'
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
	DeepPartial,
	DeleteResult,
	FindManyOptions,
	FindOneOptions,
	FindOptionsWhere,
	IsNull,
	Not,
	Repository,
	UpdateResult
} from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { WorkspaceBaseEntity } from '../core/entities/base.entity'
import { XpertWorkspaceAccessAction, XpertWorkspaceAccessResult, XpertWorkspaceAccessService } from './workspace-access.service'
import { XpertWorkspace } from './workspace.entity'

type WorkspaceScopedPartial<T extends WorkspaceBaseEntity> = DeepPartial<T> & {
	id?: string | number
	workspaceId?: string | null
	tenantId?: string | null
	organizationId?: string | null
	createdById?: string | null
	updatedById?: string | null
}

@Injectable()
export class XpertWorkspaceBaseService<T extends WorkspaceBaseEntity> extends TenantOrganizationAwareCrudService<T> {
	readonly #logger = new Logger(XpertWorkspaceBaseService.name)

	@Inject(CommandBus)
	protected readonly commandBus: CommandBus
	@Inject(QueryBus)
	protected readonly queryBus: QueryBus

	constructor(
		repository: Repository<T>,
		protected readonly workspaceAccessService: XpertWorkspaceAccessService
	) {
		super(repository)
	}

	async getAllByWorkspace(workspaceId: string, data: PaginationParams<T>, published: boolean, user: IUser) {
		const { select, relations, order, take } = data ?? {}
		let { where } = data ?? {}
		where = transformWhere(where ?? {})

		if (this.isEmptyWorkspaceId(workspaceId)) {
			where = {
				...(where as FindOptionsWhere<T>),
				workspaceId: IsNull(),
				createdById: user.id
			}
		} else {
			await this.assertWorkspaceReadAccess(workspaceId)
			where = {
				...(where as FindOptionsWhere<T>),
				workspaceId
			}
		}

		if (published) {
			where.publishAt = Not(IsNull())
		}

		return this.findAll({
			select,
			where,
			relations,
			order,
			take
		})
	}

	public async findAll(filter?: FindManyOptions<T>): Promise<IPagination<T>> {
		const scopedFilter = await this.resolveWorkspaceScopedFindManyOptions(filter)
		if (!scopedFilter) {
			return super.findAll(filter)
		}

		const [items, total] = await this.repository.findAndCount(scopedFilter)
		return { items, total }
	}

	public async findOne(id: string | number | FindOneOptions<T>, options?: FindOneOptions<T>): Promise<T> {
		if (typeof id === 'string' || typeof id === 'number') {
			const record = await this.repository.findOne({
				...(options ?? {}),
				where: this.mergeFindOneWhereWithTenant(id, options?.where)
			})
			return this.assertRecordReadable(record)
		}

		const record = await this.repository.findOne(id)
		return this.assertRecordReadable(record)
	}

	public async findOneByIdString(id: string, options?: FindOneOptions<T>): Promise<T> {
		return this.findOne(id, options)
	}

	public async create(entity: DeepPartial<T>, ...options: unknown[]): Promise<T> {
		const workspaceId = this.getEntityWorkspaceId(entity)
		if (!workspaceId) {
			return super.create(entity, ...options)
		}

		const { workspace } = await this.assertWorkspaceWriteAccess(workspaceId)
		return this.createInWorkspaceScope(this.applyWorkspaceScope(entity, workspace))
	}

	public async save(entity: DeepPartial<T>): Promise<T> {
		const workspaceId = this.getEntityWorkspaceId(entity)
		if (!workspaceId) {
			return super.save(entity)
		}

		const { workspace } = await this.assertWorkspaceWriteAccess(workspaceId)
		return this.repository.save(this.applyWorkspaceScope(entity, workspace))
	}

	public async update(
		id: string | number | FindOptionsWhere<T>,
		partialEntity: QueryDeepPartialEntity<T>,
		...options: unknown[]
	): Promise<UpdateResult | T> {
		if (typeof id !== 'string') {
			return super.update(id, partialEntity, ...options)
		}

		const current = await this.findOneByIdString(id)
		const mutationWorkspaceId = this.getMutationWorkspaceId(partialEntity)
		const targetWorkspaceId = mutationWorkspaceId === undefined ? current.workspaceId : mutationWorkspaceId

		if (!targetWorkspaceId) {
			if (current.workspaceId) {
				await this.assertWorkspaceWriteAccess(current.workspaceId)
			}
			return super.update(id, partialEntity, ...options)
		}

		const { workspace } = await this.assertWorkspaceWriteAccess(targetWorkspaceId)
		const scopedEntity = this.applyWorkspaceScope(partialEntity as WorkspaceScopedPartial<T>, workspace)
		Object.assign(current, scopedEntity, {
			updatedById: RequestContext.currentUserId() ?? current.updatedById
		})

		return this.repository.save(current)
	}

	public async delete(criteria: string | FindOptionsWhere<T>): Promise<DeleteResult> {
		if (typeof criteria === 'string') {
			const record = await this.findOneByIdString(criteria)
			if (record.workspaceId) {
				await this.assertWorkspaceWriteAccess(record.workspaceId)
			}
		}

		return super.delete(criteria)
	}

	public async softDelete(criteria: string | number | FindOptionsWhere<T>): Promise<UpdateResult | T> {
		if (typeof criteria === 'string') {
			const record = await this.findOneByIdString(criteria)
			if (record.workspaceId) {
				await this.assertWorkspaceWriteAccess(record.workspaceId)
			}
		}

		return super.softDelete(criteria)
	}

	protected async assertWorkspaceReadAccess(workspaceId: string): Promise<XpertWorkspaceAccessResult> {
		return this.assertWorkspaceAccess(workspaceId, 'read')
	}

	protected async assertWorkspaceRunAccess(workspaceId: string): Promise<XpertWorkspaceAccessResult> {
		return this.assertWorkspaceAccess(workspaceId, 'run')
	}

	protected async assertWorkspaceWriteAccess(workspaceId: string): Promise<XpertWorkspaceAccessResult> {
		return this.assertWorkspaceAccess(workspaceId, 'write')
	}

	protected async assertWorkspaceAccess(
		workspaceId: string,
		action: XpertWorkspaceAccessAction
	): Promise<XpertWorkspaceAccessResult> {
		if (this.isEmptyWorkspaceId(workspaceId)) {
			throw new BadRequestException('Workspace id is required.')
		}

		return this.workspaceAccessService.assertCan(workspaceId, action)
	}

	protected applyWorkspaceScope<E extends WorkspaceScopedPartial<T>>(entity: E, workspace: XpertWorkspace): E {
		return {
			...entity,
			workspaceId: workspace.id,
			tenantId: workspace.tenantId,
			organizationId: workspace.organizationId ?? null
		}
	}

	private async createInWorkspaceScope(entity: DeepPartial<T>): Promise<T> {
		const userId = RequestContext.currentUserId()
		const scopedEntity: WorkspaceScopedPartial<T> = {
			...(entity as WorkspaceScopedPartial<T>),
			...(userId && !this.getCreatedById(entity) ? { createdById: userId } : {}),
			...(userId ? { updatedById: userId } : {})
		}
		const obj = this.repository.create(scopedEntity)

		try {
			return await this.repository.save(obj)
		} catch (error) {
			throw new BadRequestException(error)
		}
	}

	private async resolveWorkspaceScopedFindManyOptions(filter?: FindManyOptions<T>): Promise<FindManyOptions<T> | null> {
		if (!filter?.where) {
			return null
		}

		const whereItems = this.asWorkspaceWhereArray(filter.where)
		if (!whereItems.some((where) => !!this.getWhereWorkspaceId(where))) {
			return null
		}

		const resolvedWhere: FindOptionsWhere<T>[] = []
		for (const where of whereItems) {
			const workspaceId = this.getWhereWorkspaceId(where)
			const normalizedWhere = transformWhere(where) as FindOptionsWhere<T>
			if (!workspaceId) {
				resolvedWhere.push(this.mergeCurrentScopeWhere(normalizedWhere))
				continue
			}

			const { workspace } = await this.assertWorkspaceReadAccess(workspaceId)
			resolvedWhere.push(this.mergeWorkspaceScopeWhere(normalizedWhere, workspace))
		}

		return {
			...filter,
			where: Array.isArray(filter.where) ? resolvedWhere : resolvedWhere[0]
		}
	}

	private mergeFindOneWhereWithTenant(
		id: string | number,
		where?: FindOneOptions<T>['where']
	): FindOneOptions<T>['where'] {
		const tenantId = this.requireTenantId()
		const idWhere = {
			id,
			tenantId
		} as FindOptionsWhere<T>

		if (Array.isArray(where)) {
			return where.map((item) => ({
				...item,
				...idWhere
			}))
		}

		return {
			...(where ?? {}),
			...idWhere
		} as FindOptionsWhere<T>
	}

	private async assertRecordReadable(record: T | null): Promise<T> {
		if (!record) {
			throw new NotFoundException(`The requested record was not found`)
		}

		if (record.workspaceId) {
			await this.assertWorkspaceReadAccess(record.workspaceId)
			return record
		}

		const tenantId = RequestContext.currentTenantId()
		if (tenantId && record.tenantId !== tenantId) {
			throw new NotFoundException(`The requested record was not found`)
		}

		const organizationId = RequestContext.getOrganizationId()
		if ((record.organizationId ?? null) !== (organizationId ?? null)) {
			throw new NotFoundException(`The requested record was not found`)
		}

		return record
	}

	private mergeWorkspaceScopeWhere(where: FindOptionsWhere<T>, workspace: XpertWorkspace): FindOptionsWhere<T> {
		return {
			...where,
			workspaceId: workspace.id,
			tenantId: workspace.tenantId,
			organizationId: workspace.organizationId ?? IsNull()
		} as FindOptionsWhere<T>
	}

	private mergeCurrentScopeWhere(where: FindOptionsWhere<T>): FindOptionsWhere<T> {
		return {
			...where,
			tenantId: this.requireTenantId(),
			organizationId: RequestContext.getOrganizationId() ?? IsNull()
		} as FindOptionsWhere<T>
	}

	private asWorkspaceWhereArray(where: FindManyOptions<T>['where']): FindOptionsWhere<T>[] {
		if (Array.isArray(where)) {
			return where
		}

		return [where as FindOptionsWhere<T>]
	}

	private getWhereWorkspaceId(where: FindOptionsWhere<T>): string | null {
		return this.normalizeWorkspaceId(where.workspaceId)
	}

	private getEntityWorkspaceId(entity: DeepPartial<T>): string | null {
		return this.normalizeWorkspaceId((entity as WorkspaceScopedPartial<T>).workspaceId)
	}

	private getMutationWorkspaceId(entity: QueryDeepPartialEntity<T>): string | null | undefined {
		if (!('workspaceId' in entity)) {
			return undefined
		}

		return this.normalizeWorkspaceId((entity as WorkspaceScopedPartial<T>).workspaceId)
	}

	private getCreatedById(entity: DeepPartial<T>): string | number | null | undefined {
		return (entity as WorkspaceScopedPartial<T>).createdById
	}

	private normalizeWorkspaceId(value: unknown): string | null {
		if (typeof value !== 'string') {
			return null
		}

		const workspaceId = value.trim()
		if (!workspaceId || workspaceId === 'null' || workspaceId === 'undefined') {
			return null
		}

		return workspaceId
	}

	private isEmptyWorkspaceId(workspaceId: string | null | undefined) {
		return !this.normalizeWorkspaceId(workspaceId)
	}

	private requireTenantId() {
		const tenantId = RequestContext.currentTenantId()
		if (!tenantId) {
			throw new ForbiddenException('Tenant context is required.')
		}
		return tenantId
	}
}
