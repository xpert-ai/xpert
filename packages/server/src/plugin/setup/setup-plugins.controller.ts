import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common'
import { RolesEnum } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { t } from 'i18next'
import { Roles } from '../../shared/decorators'
import { RoleGuard, TenantPermissionGuard } from '../../shared/guards'
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe'
import { setupPluginsInput, setupPluginsCatalogQuery } from './setup-plugins.schema'
import { SetupPluginsService } from './setup-plugins.service'

@Controller('system/setup/plugins')
@UseGuards(TenantPermissionGuard, RoleGuard)
@Roles(RolesEnum.SUPER_ADMIN)
export class SetupPluginsController {
	constructor(private readonly setup: SetupPluginsService) {}

	@Get()
	status() {
		return this.setup.status()
	}

	@Get('catalog')
	catalog(
		@Query(
			new ZodValidationPipe(
				setupPluginsCatalogQuery,
				() =>
					new BadRequestException(
						t('server:Error.SetupPluginCatalogQuery', { defaultValue: 'Invalid plugin catalog query.' })
					)
			)
		)
		query: z.output<typeof setupPluginsCatalogQuery>
	) {
		return this.setup.catalog(query)
	}

	@Post()
	@HttpCode(202)
	start(
		@Body(
			new ZodValidationPipe(
				setupPluginsInput,
				() =>
					new BadRequestException(
						t('server:Error.SetupPluginSelection', { defaultValue: 'Invalid setup plugin selection.' })
					)
			)
		)
		input: z.output<typeof setupPluginsInput>
	) {
		return this.setup.start(input.plugins, input.importDefaultAgentPlugins)
	}
}
