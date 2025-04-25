import { IEmployee, IEmployeeCreateInput, IPagination, RolesEnum } from '@metad/contracts';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import moment from 'moment';
import { Brackets, Like, Repository } from 'typeorm';
import { RequestContext } from '../core/context';
import { TenantAwareCrudService } from './../core/crud';
import { EmployeePublicDTO } from './dto/public.dto';
import { Employee } from './employee.entity';

@Injectable()
export class EmployeeService extends TenantAwareCrudService<Employee> {
	constructor(
		@InjectRepository(Employee)
		protected readonly employeeRepository: Repository<Employee>
	) {
		super(employeeRepository);
	}

	async createBulk(input: IEmployeeCreateInput[]): Promise<Employee[]> {
		return Promise.all(
			input.map((emp) => {
				emp.user.tenant = {
					id: emp.organization.tenantId
				};
				return this.create(emp);
			})
		);
	}

	public async findAllActive(): Promise<Employee[]> {
		const user = RequestContext.currentUser();

		if (user && user.tenantId) {
			return await this.repository.find({
				where: { isActive: true, tenantId: user.tenantId },
				relations: ['user']
			});
		}
	}

	/**
	 * Find the employees working in the organization for a particular month.
	 * An employee is considered to be 'working' if:
	 * 1. The startedWorkOn date is (not null and) less than the last day forMonth
	 * 2. The endWork date is either null or greater than the first day forMonth
	 * @param organizationId  The organization id of the employees to find
	 * @param tenantId  The tenant id of the employees to find
	 * @param forMonth  Only the month & year is considered
	 */
	async findWorkingEmployees(
		organizationId: string,
		forMonth: Date,
		withUser: boolean
	): Promise<IPagination<IEmployee>> {
		const tenantId = RequestContext.currentTenantId();
		const query = this.employeeRepository.createQueryBuilder('employee');
		query
			.where(`${query.alias}."organizationId" = :organizationId`, {
				organizationId
			})
			.andWhere(`${query.alias}."tenantId" = :tenantId`, {
				tenantId
			})
			.andWhere(`${query.alias}."isActive" = true`)
			.andWhere(
				`${query.alias}."startedWorkOn" <= :startedWorkOnCondition`,
				{
					startedWorkOnCondition: moment(forMonth)
						.endOf('month')
						.format('YYYY-MM-DD hh:mm:ss')
				}
			)
			.andWhere(
				new Brackets((notEndedCondition) => {
					notEndedCondition
						.where(`${query.alias}."endWork" IS NULL`)
						.orWhere(
							`${query.alias}."endWork" >= :endWorkOnCondition`,
							{
								endWorkOnCondition: moment(forMonth)
									.startOf('month')
									.format('YYYY-MM-DD hh:mm:ss')
							}
						);
				})
			);

		if (withUser) {
			query.leftJoinAndSelect(`${query.alias}.user`, 'user');
		}

		const [items, total] = await query.getManyAndCount();
		return {
			total,
			items
		};
	}

	/**
	 * Find the counts of employees working in the organization for a particular month.
	 * An employee is considered to be 'working' if:
	 * 1. The startedWorkOn date is (not null and) less than the last day forMonth
	 * 2. The endWork date is either null or greater than the first day forMonth
	 * @param organizationId  The organization id of the employees to find
	 * @param tenantId  The tenant id of the employees to find
	 * @param forMonth  Only the month & year is considered
	 */
	async findWorkingEmployeesCount(
		organizationId: string,
		forMonth: Date,
		withUser: boolean
	): Promise<{ total: number }> {
		const { total } = await this.findWorkingEmployees(
			organizationId,
			forMonth,
			withUser
		);
		return {
			total
		};
	}

	async findWithoutTenant(id: string, relations?: any) {
		return await this.repository.findOne(id, relations);
	}

	async search(text: string) {
		const condition = Like(`%${text.split('%').join('')}%`)
		let where = [
			{
				description: condition
			},
			{
				user: {
					email: condition
				}
			}, {
				user: {
					firstName: condition
				}
			}, {
				user: {
					lastName: condition
				}
			}] as any

		if (RequestContext.hasRole(RolesEnum.TRIAL)) {
			const userId = RequestContext.currentUserId()
			where = {
				user: {
					id: userId
				}
			}
		}
		return this.findAll({
			where,
			relations: ['user']
		}).then((result) => ({
			...result,
			items: result.items.map((item) => new EmployeePublicDTO(item))
		}))
	}
}
