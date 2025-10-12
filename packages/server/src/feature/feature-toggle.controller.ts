import {
	IFeature,
	IFeatureOrganization,
	IPagination,
	PermissionsEnum,
} from '@metad/contracts'
import { BadRequestException, Body, Controller, Get, HttpStatus, Post, Query, UseGuards } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Public, Roles } from './../shared/decorators'
import { PermissionGuard, RoleGuard, TenantPermissionGuard } from './../shared/guards'
import { Permissions } from './../shared/decorators';
import { FeatureToggleUpdateCommand } from './commands'
import { FeatureOrganizationService } from './feature-organization.service'
import { Feature } from './feature.entity'
import { FeatureService } from './feature.service'
import { getFeatureToggleDefinitions } from './default-features'
import { RelationsQueryDTO, UseValidationPipe } from '../shared'
import { CreateFeatureToggleDTO, FeatureOrganizationQueryDTO } from './dto'

@ApiTags('Feature')
@Controller('toggle')
export class FeatureToggleController {
	constructor(
		private readonly _featureService: FeatureService,
		private readonly _featureOrganizationService: FeatureOrganizationService,
		private readonly _commandBus: CommandBus
	) {}

	@Get('definition')
	@Public()
	async getFeatureToggleDefinitions() {
		// let featureToggles: FeatureInterface[] = getFeatureToggleDefinitions()

		// //only support metad feature and removed other
		// const featureEnums: string[] = Object.values(FeatureEnum)
		// if (featureToggles) {
		// 	featureToggles = featureToggles.filter((toggle: FeatureInterface) => featureEnums.includes(toggle.name))
		// }
		return getFeatureToggleDefinitions()
	}

	@ApiOperation({ summary: 'Find all parent features.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found feature',
		type: Feature
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Get('parent')
	async getParentFeatureList(@Query() options: RelationsQueryDTO) {
		try {
			return await this._featureService.getParentFeatures(options.relations);
		} catch (error) {
			throw new BadRequestException(error);
		}
	}

	@ApiOperation({ summary: 'Find all feature organizations.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found feature',
		type: Feature
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@UseGuards(TenantPermissionGuard, PermissionGuard)
	@Permissions(PermissionsEnum.ALL_ORG_VIEW)
	@Get('/organizations')
	@UseValidationPipe({ transform: true, whitelist: true })
	async getFeaturesOrganization(
		@Query() params: FeatureOrganizationQueryDTO
	): Promise<IPagination<IFeatureOrganization>> {
		try {
			return await this._featureOrganizationService.findAll({
				where: {
					...(params.tenantId
						? {
								tenantId: params.tenantId
						  }
						: {}),
					...(params.organizationId
						? {
								organizationId: params.organizationId
						  }
						: {})
				},
				relations: params.relations || []
			});
		} catch (error) {
			throw new BadRequestException(error);
		}
	}

	@ApiOperation({ summary: 'Find all features.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found feature',
		type: Feature
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@UseGuards(TenantPermissionGuard, PermissionGuard)
	@Permissions(PermissionsEnum.ALL_ORG_VIEW)
	@Get('/')
	async findAll(): Promise<IPagination<IFeature>> {
		try {
			return await this._featureService.findAll();
		} catch (error) {
			throw new BadRequestException(error);
		}
	}

	@ApiOperation({ summary: 'Enabled or disabled features' })
	@ApiResponse({
		status: HttpStatus.CREATED,
		description: 'The record has been successfully created/updated.'
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description: 'Invalid input, The response body may contain clues as to what went wrong'
	})
	@UseGuards(TenantPermissionGuard, PermissionGuard)
	@Permissions(PermissionsEnum.ALL_ORG_EDIT)
	@Post('/')
	@UseValidationPipe({ transform: true, whitelist: true })
	async enabledDisabledFeature(@Body() input: CreateFeatureToggleDTO[]): Promise<boolean[]> {
		return await Promise.all(
			input.map(item => this._commandBus.execute(new FeatureToggleUpdateCommand(item)))
		)
	}
}
