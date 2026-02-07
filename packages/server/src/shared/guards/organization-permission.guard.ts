import { environment as env } from '@metad/server-config';
import { RolesEnum } from '@metad/contracts';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
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
			const currentUser = RequestContext.currentUser();
			const role = currentUser?.role?.name;
			const employeeId = currentUser?.employeeId ?? currentUser?.employee?.id;

			if (
				env.allowSuperAdminRole === true &&
				role === RolesEnum.SUPER_ADMIN
			) {
				return true;
			}

			const userId = currentUser?.id;
			if (!employeeId && !userId) {
				return false;
			}

			const employee = await this.employeeRepository.findOne({
				where: employeeId ? { id: employeeId } : { userId },
				relations: ['organization']
			})

			let organizationId: string;
			if (employee?.organization) {
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
