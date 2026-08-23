import type { CreateBusinessAreaInput, IPagination, UpdateBusinessAreaInput } from '@xpert-ai/contracts'
import { RolesEnum } from '@xpert-ai/contracts'
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import type { DeleteResult } from 'typeorm'

import { UUIDValidationPipe } from '../shared/pipes'
import { Roles } from '../shared/decorators'
import { RoleGuard } from '../shared/guards'
import { BusinessArea } from './business-area.entity'
import { BusinessAreaService } from './business-area.service'

@ApiTags('BusinessArea')
@ApiBearerAuth()
@Controller()
export class BusinessAreaController {
	constructor(private readonly businessAreaService: BusinessAreaService) {}

	@Get()
	findAll(): Promise<IPagination<BusinessArea>> {
		return this.businessAreaService.findAll()
	}

	@Get(':id')
	findOne(@Param('id', UUIDValidationPipe) id: string): Promise<BusinessArea> {
		return this.businessAreaService.findOneByIdString(id)
	}

	@Post()
	@UseGuards(RoleGuard)
	@Roles(RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN)
	createArea(@Body() input: CreateBusinessAreaInput): Promise<BusinessArea> {
		return this.businessAreaService.createArea(input)
	}

	@Put(':id')
	@UseGuards(RoleGuard)
	@Roles(RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN)
	updateArea(
		@Param('id', UUIDValidationPipe) id: string,
		@Body() input: UpdateBusinessAreaInput
	): Promise<BusinessArea> {
		return this.businessAreaService.updateArea(id, input)
	}

	@Delete(':id')
	@HttpCode(HttpStatus.ACCEPTED)
	@UseGuards(RoleGuard)
	@Roles(RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN)
	deleteArea(@Param('id', UUIDValidationPipe) id: string): Promise<DeleteResult> {
		return this.businessAreaService.deleteArea(id)
	}
}
