import { IPagination } from '@xpert-ai/contracts'
import { CrudController, ParseJsonPipe } from '@xpert-ai/server-core'
import { Controller, Get, HttpStatus, Query } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { FindManyOptions } from 'typeorm'
import { Certification } from './certification.entity'
import { CertificationService } from './certification.service'

@ApiTags('Certification')
@ApiBearerAuth()
@Controller()
export class CertificationController extends CrudController<Certification> {
	constructor(private readonly certificationService: CertificationService, private readonly commandBus: CommandBus) {
		super(certificationService)
	}

	@ApiOperation({ summary: 'find all' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found all records'
	})
	@Get()
	async findAll(@Query('data', ParseJsonPipe) data: FindManyOptions): Promise<IPagination<Certification>> {
		const { relations } = data
		return this.certificationService.findAll({
			relations
		})
	}
}
