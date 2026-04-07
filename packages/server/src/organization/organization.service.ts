import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { CommandBus } from '@nestjs/cqrs'
import { Repository, FindOneOptions, FindOptionsWhere } from 'typeorm'
import { TenantAwareCrudService } from './../core/crud'
import { Organization } from './organization.entity'
import { OrganizationDemoCommand } from './commands'
import { InviteStatusEnum, OrgGenerateDemoOptions, RolesEnum } from '@metad/contracts'
import { Invite, UserGroup, UserOrganization } from '../core/entities/internal'
import { RequestContext } from '../core/context'

@Injectable()
export class OrganizationService extends TenantAwareCrudService<Organization> {
	constructor(
		@InjectRepository(Organization)
		private readonly organizationRepository: Repository<Organization>,
		@InjectRepository(UserOrganization)
		private readonly userOrganizationRepository: Repository<UserOrganization>,
		@InjectRepository(Invite)
		private readonly inviteRepository: Repository<Invite>,
		@InjectRepository(UserGroup)
		private readonly userGroupRepository: Repository<UserGroup>,

		private readonly commandBus: CommandBus
	) {
		super(organizationRepository)
	}

	private currentTenantId() {
		const tenantId = RequestContext.currentTenantId()
		if (!tenantId) {
			throw new BadRequestException('Tenant context is required for organization access.')
		}

		return tenantId
	}

	private async findOrganizationForMutation(criteria: string | FindOptionsWhere<Organization>) {
		const tenantId = this.currentTenantId()
		const where =
			typeof criteria === 'object'
				? ({
						...criteria,
						tenantId
					} as FindOptionsWhere<Organization>)
				: ({
						id: criteria,
						tenantId
					} as FindOptionsWhere<Organization>)

		const organization = await this.organizationRepository.findOne({
			where
		})

		if (!organization) {
			throw new BadRequestException('The requested organization was not found in the current tenant.')
		}

		return organization
	}

	/**
	 * Returns the organization based on the public link irrespective of the tenant.
	 */
	public async findByPublicLink(
		profile_link: string,
		select?: string,
		relation?: string
	): Promise<Organization> {
		const findObj: FindOneOptions<Organization> = {
			where: { profile_link }
		};

		if (select) {
			findObj['select'] = JSON.parse(select);
			findObj['relations'] = JSON.parse(relation);
		}

		return await this.organizationRepository.findOne(
			findObj
		)
	}

	override async delete(criteria: string | FindOptionsWhere<Organization>, options?: any) {
		const organization = await this.findOrganizationForMutation(criteria)

		const memberships = await this.userOrganizationRepository.find({
			where: {
				tenantId: organization.tenantId,
				organizationId: organization.id
			},
			relations: ['user', 'user.role']
		})
		const hasNonSuperAdminMembers = memberships.some(
			(membership) => membership.user?.role?.name !== RolesEnum.SUPER_ADMIN
		)

		if (hasNonSuperAdminMembers) {
			throw new BadRequestException('Cannot delete an organization that still has members.')
		}

		const pendingInviteCount = await this.inviteRepository.count({
			where: {
				tenantId: organization.tenantId,
				organizationId: organization.id,
				status: InviteStatusEnum.INVITED
			}
		})

		if (pendingInviteCount > 0) {
			throw new BadRequestException('Cannot delete an organization that still has pending invites.')
		}

		const userGroupCount = await this.userGroupRepository.count({
			where: {
				tenantId: organization.tenantId,
				organizationId: organization.id
			}
		})

		if (userGroupCount > 0) {
			throw new BadRequestException('Cannot delete an organization that still has user groups.')
		}

		return super.delete(criteria, options)
	}

	/**
	 * Generate demo data for the organization (e.g. demo projects, demo dashboards, etc.)
	 */
	public async generateDemo(id: string, options: OrgGenerateDemoOptions) {
		const organization = await this.organizationRepository.findOneBy({ id: id })

		await this.commandBus.execute(
			new OrganizationDemoCommand({
				id,
				options
			})
		)

		organization.createdDemo = true
		return await this.organizationRepository.save(organization)
	}
}
