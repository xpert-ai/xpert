import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { AuthModule } from '../auth/auth.module'
import { EmailModule } from '../email'
import { TenantModule } from '../tenant/tenant.module'
import { UserOrganizationModule } from '../user-organization/user-organization.module'
import { UserModule } from './../user/user.module'
import { EmployeeController } from './employee.controller'
import { Employee } from './employee.entity'
import { EmployeeService } from './employee.service'

@Module({
	imports: [
		RouterModule.register([{ path: '/employee', module: EmployeeModule }]),
		TypeOrmModule.forFeature([Employee]),
		forwardRef(() => EmailModule),
		forwardRef(() => UserOrganizationModule),
		forwardRef(() => CqrsModule),
		forwardRef(() => TenantModule),
		forwardRef(() => UserModule),
		forwardRef(() => AuthModule)
	],
	controllers: [EmployeeController],
	providers: [EmployeeService],
	exports: [EmployeeService]
})
export class EmployeeModule {}
