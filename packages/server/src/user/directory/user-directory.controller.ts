import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common'
import { PermissionsEnum } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { Permissions } from '../../shared/decorators/permissions'
import { PermissionGuard } from '../../shared/guards/permission.guard'
import { TenantPermissionGuard } from '../../shared/guards/tenant-permission.guard'
import { ParseJsonPipe } from '../../shared/pipes/parse-json.pipe'
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe'
import { userDirectoryQuerySchema, UserDirectoryQuery } from './user-directory.schema'
import { UserDirectoryService } from './user-directory.service'

@Controller('directory')
export class UserDirectoryController {
	constructor(private readonly directory: UserDirectoryService) {}

	@Get()
	@UseGuards(TenantPermissionGuard, PermissionGuard)
	@Permissions(
		PermissionsEnum.ALL_ORG_VIEW,
		PermissionsEnum.ALL_ORG_EDIT,
		PermissionsEnum.ORG_USERS_VIEW,
		PermissionsEnum.ORG_USERS_EDIT
	)
	list(
		@Query(
			'data',
			ParseJsonPipe,
			new ZodValidationPipe(
				userDirectoryQuerySchema,
				() =>
					new BadRequestException(
						t('server-ai:Error.InvalidUserDirectoryQuery', {
							defaultValue: 'Provide valid user filters and pagination.'
						})
					)
			)
		)
		query: UserDirectoryQuery
	) {
		return this.directory.list(query)
	}
}
