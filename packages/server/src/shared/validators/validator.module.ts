import { Module } from '@nestjs/common';
import { UserOrganizationModule } from '../../user-organization/user-organization.module';
import { RoleModule } from '../../role/role.module';
import { EmployeeModule } from '../../employee/employee.module';
import {
	TenantBelongsToUserConstraint,
	RoleShouldExistConstraint,
	OrganizationBelongsToUserConstraint
} from './constraints';

@Module({
	imports: [EmployeeModule, UserOrganizationModule, RoleModule],
	providers: [
		TenantBelongsToUserConstraint,
		RoleShouldExistConstraint,
		OrganizationBelongsToUserConstraint
	]
})
export class ValidatorModule {}
