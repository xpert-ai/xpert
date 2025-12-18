import { environment as env } from '@metad/server-config';
import { RolesEnum } from '@metad/contracts';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { verify } from 'jsonwebtoken';
import { Repository } from 'typeorm';
import { RequestContext } from './../../core/context';
import { Employee } from './../../core/entities/internal';

@Injectable()
export class OrganizationPermissionGuard implements CanActivate {
	constructor(
		private readonly _reflector: Reflector,

		@InjectRepository(Employee)
		private readonly employeeRepository: Repository<Employee>
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const permissions = this._reflector.get<string[]>(
			'permissions',
			context.getHandler()
		);

		let isAuthorized = false;
		if (!permissions) {
			isAuthorized = true;
		} else {
			const token = RequestContext.currentToken();
			const { employeeId, role } = verify(token, env.JWT_SECRET) as {
				id: string;
				role: string;
				employeeId: string;
			};

			if (
				env.allowSuperAdminRole === true &&
				role === RolesEnum.SUPER_ADMIN
			) {
				return true;
			}

			console.log(`employeeId`, employeeId)

			const employee = await this.employeeRepository.findOne({
				where: { id: employeeId },
				relations: ['organization']
			})

			let organizationId: string;
			if (employeeId && employee.organization) {
				organizationId = employee.organization.id;
				isAuthorized = permissions.filter((p) => employee.organization[p]).length > 0;
			}

			if (!isAuthorized) {
				console.log(
					'Unauthorized access blocked. OrganizationId:',
					organizationId,
					' Permissions Checked:',
					permissions
				);
			}
		}

		return isAuthorized;
	}
}
