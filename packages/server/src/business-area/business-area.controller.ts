import { PermissionsEnum } from '@xpert-ai/contracts'
import { Permissions } from './../shared/decorators/permissions'
import type { CreateBusinessAreaInput, IPagination, UpdateBusinessAreaInput } from '@xpert-ai/contracts'
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import type { DeleteResult } from 'typeorm'

import { UUIDValidationPipe } from '../shared/pipes'
import { BusinessArea } from './business-area.entity'
import { BusinessAreaService } from './business-area.service'

@ApiTags('BusinessArea')
@ApiBearerAuth()
@Controller()
export class BusinessAreaController {
	constructor(private readonly businessAreaService: BusinessAreaService) {}

	@Get()
	@Permissions(PermissionsEnum.BUSINESS_AREA_VIEW)
	findAll(): Promise<IPagination<BusinessArea>> {
		return this.businessAreaService.findAll()
	}

	@Get(':id')
	@Permissions(PermissionsEnum.BUSINESS_AREA_VIEW)
	findOne(@Param('id', UUIDValidationPipe) id: string): Promise<BusinessArea> {
		return this.businessAreaService.findOneByIdString(id)
	}

	@Post()
	@Permissions(PermissionsEnum.BUSINESS_AREA_MANAGE)
	createArea(@Body() input: CreateBusinessAreaInput): Promise<BusinessArea> {
		return this.businessAreaService.createArea(input)
	}

	@Put(':id')
	@Permissions(PermissionsEnum.BUSINESS_AREA_MANAGE)
	updateArea(
		@Param('id', UUIDValidationPipe) id: string,
		@Body() input: UpdateBusinessAreaInput
	): Promise<BusinessArea> {
		return this.businessAreaService.updateArea(id, input)
	}

	@Delete(':id')
	@HttpCode(HttpStatus.ACCEPTED)
	@Permissions(PermissionsEnum.BUSINESS_AREA_MANAGE)
	deleteArea(@Param('id', UUIDValidationPipe) id: string): Promise<DeleteResult> {
		return this.businessAreaService.deleteArea(id)
	}
}
