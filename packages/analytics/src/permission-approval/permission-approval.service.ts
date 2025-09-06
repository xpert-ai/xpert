import {
	ApprovalPolicyTypesStringEnum,
	IBusinessArea,
	IPagination,
	IPermissionApprovalCreateInput,
	IPermissionApprovalFindInput,
	IPermissionApprovalUser,
	IUser,
	PermissionApprovalStatusTypesEnum
} from '@metad/contracts'
import { RequestContext, TenantAwareCrudService, User } from '@metad/server-core'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, In, Repository } from 'typeorm'
import { BusinessArea, PermissionApprovalUser } from '../core/entities/internal'
import { PermissionApproval } from './permission-approval.entity'

@Injectable()
export class PermissionApprovalService extends TenantAwareCrudService<PermissionApproval> {

	private readonly logger = new Logger(PermissionApprovalService.name)

	constructor(
		@InjectRepository(PermissionApproval)
		private readonly permissionApprovalRepository: Repository<PermissionApproval>,
		@InjectRepository(User)
		private readonly userRepository: Repository<User>,

		@InjectRepository(PermissionApprovalUser)
		private readonly pauRepository: Repository<PermissionApprovalUser>
	) {
		super(permissionApprovalRepository)
	}

	async findAllPermissionApprovals(businessAreas: IBusinessArea[]): Promise<IPagination<PermissionApproval>> {
		let query = this.permissionApprovalRepository.createQueryBuilder('permission_approval')
		query.leftJoinAndSelect(`${query.alias}.approvalPolicy`, 'approvalPolicy')
		query.leftJoinAndSelect(`${query.alias}.indicator`, 'indicator')
		query.leftJoinAndSelect(`${query.alias}.userApprovals`, 'userApprovals')
		query.leftJoinAndSelect(`${query.alias}.createdBy`, 'createdBy')
		query.leftJoinAndSelect(`userApprovals.user`, 'userApprovalUser')
		query.leftJoinAndMapOne('permission_approval.indicatorGroup', BusinessArea, 'indicatorGroup', `${query.alias}.permissionType = '${ApprovalPolicyTypesStringEnum.BUSINESS_AREA}' AND ${query.alias}.permissionId = "indicatorGroup"."id"::"varchar"`)

		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		query = query.where({
			tenantId,
			organizationId
		}).andWhere(new Brackets((sqb) => {
			sqb.where(
				new Brackets((sqb) => {
					sqb.where('approvalPolicy.organizationId =:organizationId', {
						organizationId
					}).andWhere('approvalPolicy.tenantId =:tenantId', {
						tenantId
					})
				})
			)
			.orWhere(
				new Brackets((sqb) => {
					sqb.where('indicator.organizationId =:organizationId', {
						organizationId
					})
						.andWhere('indicator.tenantId =:tenantId', {
							tenantId
						})
						.andWhere('indicator.businessAreaId IN (:...businessAreas)', {
							businessAreas: businessAreas.map(({ id }) => id)
						})
				})
			)
			.orWhere(
				new Brackets((sqb) => {
					sqb.where(`permission_approval.permissionType = '${ApprovalPolicyTypesStringEnum.BUSINESS_AREA}' AND permission_approval.permissionId IN (:...businessAreas)`,
						{
							businessAreas: businessAreas.map(({ id }) => id)
						}
					)
				})
			)
		}))

		this.logger.debug(query.getSql())

		const [items, total] = await query.getManyAndCount()
		return { items, total }
	}

	async findPermissionApprovalsByUserId(id: string, relations: string[], findInput?: IPermissionApprovalFindInput) {
		try {
			const tenantId = RequestContext.currentTenantId()
			const organizationId = RequestContext.getOrganizationId()

			const result = await this.permissionApprovalRepository.find({
				where: {
					createdById: id,
					organizationId,
					tenantId
				}
			})
			const permissionApprovals = await this.pauRepository.find({
				where: {
					tenantId,
					userId: id
				},
				relations: ['permissionApproval']
			})

			for (const request of permissionApprovals) {
				const approval = await this.permissionApprovalRepository.findOne({
					where: {
						id: request.permissionApprovalId
					},
					relations: ['userApprovals']
				})
				result.push(approval)
			}

			return { items: result, total: result.length }
		} catch (error) {
			throw new BadRequestException(error)
		}
	}

	async createPermissionApproval(entity: IPermissionApprovalCreateInput): Promise<PermissionApproval> {
		try {
			const tenantId = RequestContext.currentTenantId()
			const organizationId = RequestContext.getOrganizationId()
			const permissionApproval = new PermissionApproval()
			permissionApproval.status = PermissionApprovalStatusTypesEnum.REQUESTED
			permissionApproval.approvalPolicyId = entity.approvalPolicyId
			permissionApproval.indicatorId = entity.indicatorId
			permissionApproval.permissionId = entity.permissionId
			permissionApproval.permissionType = entity.permissionType
			permissionApproval.createdById = RequestContext.currentUserId()
			permissionApproval.organizationId = organizationId
			permissionApproval.tenantId = tenantId
			if (entity.userApprovals) {
				const employees: IUser[] = await this.userRepository.find({
					where: {
						id: In(entity.userApprovals.map(({ userId }) => userId))
					}
				})
				const permissionApprovalEmployees: IPermissionApprovalUser[] = []
				employees.forEach((user: IUser) => {
					const raEmployees = new PermissionApprovalUser()
					raEmployees.userId = user.id
					raEmployees.organizationId = organizationId
					raEmployees.tenantId = tenantId
					raEmployees.status = PermissionApprovalStatusTypesEnum.REQUESTED
					permissionApprovalEmployees.push(raEmployees)
				})
				permissionApproval.userApprovals = permissionApprovalEmployees
			}

			return this.permissionApprovalRepository.save(permissionApproval)
		} catch (err) {
			throw new BadRequestException(err)
		}
	}

	async updatePermissionApproval(id: string, entity: IPermissionApprovalCreateInput): Promise<PermissionApproval> {
		try {
			const tenantId = RequestContext.currentTenantId()
			const organizationId = RequestContext.getOrganizationId()
			const permissionApproval = await this.permissionApprovalRepository.findOneBy({
				id
			})
			permissionApproval.status = PermissionApprovalStatusTypesEnum.REQUESTED
			permissionApproval.approvalPolicyId = entity.approvalPolicyId
			permissionApproval.indicatorId = entity.indicatorId
			permissionApproval.permissionId = entity.permissionId
			permissionApproval.permissionType = entity.permissionType
			permissionApproval.updatedById = RequestContext.currentUserId()
			permissionApproval.organizationId = organizationId
			permissionApproval.tenantId = tenantId

			await this.repository
				.createQueryBuilder()
				.delete()
				.from(PermissionApprovalUser)
				.where('permissionApprovalId = :id', { id: id })
				.execute()

			if (entity.userApprovals) {
				const employees: IUser[] = await this.userRepository.find({
					where: {
						id: In(entity.userApprovals.map(({ userId }) => userId))
					}
				})
				const permissionApprovalEmployees: IPermissionApprovalUser[] = []
				employees.forEach((employee) => {
					const raEmployees = new PermissionApprovalUser()
					raEmployees.userId = employee.id
					raEmployees.user = employee
					raEmployees.organizationId = organizationId
					raEmployees.tenantId = tenantId
					raEmployees.status = PermissionApprovalStatusTypesEnum.REQUESTED
					permissionApprovalEmployees.push(raEmployees)
				})
				permissionApproval.userApprovals = permissionApprovalEmployees
			}

			return this.permissionApprovalRepository.save(permissionApproval)
		} catch (err /*: WriteError*/) {
			throw new BadRequestException(err)
		}
	}

	async updateStatusApprovalByAdmin(id: string, status: number): Promise<PermissionApproval> {
		const [permissionApproval] = await this.permissionApprovalRepository.find({
			where: {
				id
			},
			relations: ['approvalPolicy']
		})

		if (!permissionApproval) {
			throw new NotFoundException('Permission Approval not found')
		}

		permissionApproval.status = status

		return this.permissionApprovalRepository.save(permissionApproval)
	}
}
