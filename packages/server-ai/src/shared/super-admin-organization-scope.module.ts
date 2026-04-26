import { OrganizationModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { SuperAdminOrganizationScopeService } from './super-admin-organization-scope.service'

@Module({
	imports: [OrganizationModule],
	providers: [SuperAdminOrganizationScopeService],
	exports: [SuperAdminOrganizationScopeService]
})
export class SuperAdminOrganizationScopeModule {}
