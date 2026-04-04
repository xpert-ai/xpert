import { ConfigService, environment } from '@metad/server-config';
import {
	ICreateEmailInvitesInput,
	ICreateEmailInvitesOutput,
	InviteStatusEnum,
	IOrganizationContact,
	IUser,
	ICreateOrganizationContactInviteInput,
	RolesEnum,
	LanguagesEnum,
	DEFAULT_INVITE_EXPIRY_PERIOD,
	IOrganization,
	IEmployee,
	IRole,
	InvitationExpirationEnum,
	InvitationTypeEnum,
	IInvite,
} from '@metad/contracts';
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtPayload, sign, verify } from 'jsonwebtoken';
import { Brackets, FindOptionsWhere, In, IsNull, MoreThanOrEqual, Repository } from 'typeorm';
import { TenantAwareCrudService } from './../core/crud';
import { Invite } from './invite.entity';
import { EmailService } from '../email/email.service';
import { addDays } from 'date-fns';
import { UserService } from '../user/user.service';
import { RequestContext } from './../core/context';
import {
	Organization,
	OrganizationContact,
	Role,
} from './../core/entities/internal';

function normalizeEmail(email?: string | null) {
	return email?.trim().toLowerCase() || null;
}

@Injectable()
export class InviteService extends TenantAwareCrudService<Invite> {
	constructor(
		@InjectRepository(Invite) 
		private readonly inviteRepository: Repository<Invite>,

		@InjectRepository(OrganizationContact)
		private readonly organizationContactRepository: Repository<OrganizationContact>,

		@InjectRepository(Organization)
		private readonly organizationRepository: Repository<Organization>,

		@InjectRepository(Role)
		private readonly roleRepository: Repository<Role>,

		private readonly emailService: EmailService,
		private readonly userService: UserService,
		private readonly configSerice: ConfigService
	) {
		super(inviteRepository);
	}

	/**
	 * Creates all invites. If an email Id already exists, this function will first delete
	 * the existing invite and then create a new row with the email address.
	 * @param emailInvites Emails Ids to send invite
	 */
	async createBulk(
		emailInvites: ICreateEmailInvitesInput,
		languageCode: LanguagesEnum
	): Promise<ICreateEmailInvitesOutput> {
		const invites: Invite[] = [];
		const normalizedEmailIds = (emailInvites.emailIds ?? [])
			.map((email) => normalizeEmail(email))
			.filter((email): email is string => Boolean(email));
		const {
			emailIds,
			roleId,
			organizationContactIds,
			organizationId,
			invitedById,
			startedWorkOn,
			appliedDate,
			invitationExpirationPeriod
		} = emailInvites;
		const originUrl = this.configSerice.get('clientBaseUrl') as string;

		if (!normalizedEmailIds.length) {
			return { items: [], total: 0, ignored: emailIds.length };
		}

		const organizationContacts: IOrganizationContact[] = await this.organizationContactRepository.findByIds(
			organizationContactIds || []
		);

		const organization: IOrganization = await this.organizationRepository.findOneBy({id: organizationId});
		const role: IRole = await this.roleRepository.findOneBy({id: roleId});
		const user: IUser = await this.userService.findOneByIdString(invitedById, {
			relations: ['role']
		});

		const tenantId = RequestContext.currentTenantId();
		if (role.name === RolesEnum.SUPER_ADMIN) {
			const { role: inviterRole } = user;
			if (inviterRole.name !== RolesEnum.SUPER_ADMIN) {
				throw new UnauthorizedException();
			}
		}

		let expireDate: any;
		if (invitationExpirationPeriod === InvitationExpirationEnum.NEVER) {
			expireDate = null;
		} else {
			if (invitationExpirationPeriod) {
				const inviteExpiryPeriod = invitationExpirationPeriod;
				expireDate = addDays(new Date(), inviteExpiryPeriod as number);
			} else {
				const inviteExpiryPeriod = (organization.inviteExpiryPeriod) || DEFAULT_INVITE_EXPIRY_PERIOD;
				expireDate = addDays(new Date(), inviteExpiryPeriod as number);
			}
		}

		const existingInviteEmails = (
			await this.repository
				.createQueryBuilder('invite')
				.select('invite.email', 'email')
				.where('invite.tenantId = :tenantId', { tenantId })
				.andWhere('invite.email IN (:...emails)', { emails: normalizedEmailIds })
				.andWhere('invite.status = :status', { status: InviteStatusEnum.INVITED })
				.andWhere(
					new Brackets((qb) => {
						qb.where('invite.expireDate IS NULL').orWhere('invite.expireDate >= :now', {
							now: new Date()
						});
					})
				)
				.getRawMany<{ email: string }>()
		).map((invite) => invite.email);

		const tenantUsers = await this.userService.findAll({
			where: {
				tenantId,
				email: In(normalizedEmailIds)
			}
		})
		const existingTenantUserEmails = (tenantUsers.items ?? []).map((item) => item.email)

		const blockedEmails = new Set([...existingInviteEmails, ...existingTenantUserEmails])
		const invitesToCreate = normalizedEmailIds.filter((email) => !blockedEmails.has(email));

		for (let i = 0; i < invitesToCreate.length; i++) {
			const email = invitesToCreate[i];
			const token = this.createToken(email);

			const invite = new Invite();
			invite.token = token;
			invite.email = email;
			invite.roleId = roleId;
			invite.organizationId = organizationId;
			invite.tenantId = tenantId;
			invite.invitedById = invitedById;
			invite.status = InviteStatusEnum.INVITED;
			invite.expireDate = expireDate;
			invite.organizationContact = organizationContacts;
			invite.actionDate = startedWorkOn || appliedDate;
			invites.push(invite);
		}

		const items = await this.repository.save(invites);
		items.forEach((item) => {
			const registerUrl = `${originUrl}/auth/accept-invite?email=${item.email}&token=${item.token}`;
			if (emailInvites.inviteType === InvitationTypeEnum.USER) {
				this.emailService.inviteUser({
					email: item.email,
					role: role.name,
					organization: organization,
					registerUrl,
					originUrl,
					languageCode,
					invitedBy: user
				});
			} else if (emailInvites.inviteType === InvitationTypeEnum.EMPLOYEE) {
				// this.emailService.inviteEmployee({
				// 	email: item.email,
				// 	registerUrl,
				// 	organizationContacts,
				// 	departments,
				// 	originUrl,
				// 	organization: organization,
				// 	languageCode,
				// 	invitedBy: user
				// });
			}
		});

		return { items, total: items.length, ignored: emailIds.length - invitesToCreate.length };
	}

	async resendEmail(data, invitedById, languageCode, expireDate){
		const {
			id,
			email,
			roleName,
			organization
		} = data

		const status = InviteStatusEnum.INVITED;

		const originUrl = this.configSerice.get('clientBaseUrl') as string;

		const user: IUser = await this.userService.findOneByIdString(invitedById, {
			relations: ['role']
		});

		const normalizedEmail = normalizeEmail(email);
		const token = this.createToken(normalizedEmail);

		const registerUrl = `${originUrl}/auth/accept-invite?email=${normalizedEmail}&token=${token}`;

		
		try{
			await this.update(id, {
			   status,
			   expireDate,
			   invitedById,
			   token,
			   email: normalizedEmail
			})
			
			if (data.inviteType === InvitationTypeEnum.USER) {
				this.emailService.inviteUser({
					email: normalizedEmail,
					role: roleName,
					organization: organization,
					registerUrl,
					originUrl,
					languageCode,
					invitedBy: user
				});
			} else if (data.inviteType === InvitationTypeEnum.EMPLOYEE || data.inviteType === InvitationTypeEnum.CANDIDATE) {
				// this.emailService.inviteEmployee({
				// 	email,
				// 	registerUrl,
				// 	organizationContacts: clientNames,
				// 	departments: departmentNames,
				// 	originUrl,
				// 	organization: organization,
				// 	languageCode,
				// 	invitedBy: user
				// });
			}

			
			

		}catch(error){
			return error
		}


		
	}

	async sendAcceptInvitationEmail(
		organization: IOrganization,
		employee: IEmployee,
		languageCode: LanguagesEnum
	): Promise<any> 
	{	
		const superAdminUsers: IUser[] = await this.userService.getAdminUsers(organization.tenantId);

		try {
			for await (const superAdmin of superAdminUsers) {
					this.emailService.sendAcceptInvitationEmail({
						email: superAdmin.email,
						employee,
						organization,
						languageCode,
					});
			}
		} catch (e) {
			console.log('caught', e)
		}
	}

	async createOrganizationContactInvite(
		inviteInput: ICreateOrganizationContactInviteInput
	): Promise<Invite> {
		const {
			emailId,
			roleId,
			organizationContactId,
			organizationId,
			invitedById
		} = inviteInput;

		const organizationContact: IOrganizationContact = await this.organizationContactRepository.findOneBy({id: organizationContactId});

		const organization: Organization = await this.organizationRepository.findOneBy({id: organizationId});

		const inviteExpiryPeriod =
			organization && organization.inviteExpiryPeriod
				? organization.inviteExpiryPeriod
				: DEFAULT_INVITE_EXPIRY_PERIOD;

		const expireDate = addDays(new Date(), inviteExpiryPeriod);
		const normalizedEmail = normalizeEmail(emailId);

		const invite = new Invite();
		invite.token = this.createToken(normalizedEmail);
		invite.email = normalizedEmail;
		invite.roleId = roleId;
		invite.organizationId = organizationId;
		invite.invitedById = invitedById;
		invite.status = InviteStatusEnum.INVITED;
		invite.expireDate = expireDate;
		invite.organizationContact = [organizationContact];

		const createdInvite = await this.repository.save(invite);

		// this.emailService.inviteOrganizationContact(
		// 	organizationContact,
		// 	inviterUser,
		// 	organization,
		// 	createdInvite,
		// 	languageCode,
		// 	originalUrl
		// );

		return createdInvite;
	}

	async validateByToken(where: Pick<FindOptionsWhere<Invite>, 'email' | 'token'>, relations: string[] = []): Promise<IInvite> {
		try {
			const email = normalizeEmail(where.email as string);
			const { token } = where;
			const payload: string | JwtPayload = verify(token as string, environment.JWT_SECRET);

			if (typeof payload === 'object' && 'email' in payload) {
				if (payload.email === email) {
					const baseWhere = {
						email,
						token,
						status: InviteStatusEnum.INVITED,
						...(payload['code']
							? {
									code: payload['code']
							  }
							: {})
					}

					return await this.repository.findOneOrFail({
						where: [
							{
								...baseWhere,
								expireDate: MoreThanOrEqual(new Date())
							},
							{
								...baseWhere,
								expireDate: IsNull()
							}
						],
						relations
					});
				}
			}
			throw new BadRequestException();
		} catch (error) {
			throw new BadRequestException();
		}
	}

	createToken(email): string {
		const token: string = sign({ email: normalizeEmail(email) }, environment.JWT_SECRET, {});
		return token;
	}
}
