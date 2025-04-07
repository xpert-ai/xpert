import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Environment } from './environment.entity'
import { XpertWorkspaceBaseService } from '../xpert-workspace'

@Injectable()
export class EnvironmentService extends XpertWorkspaceBaseService<Environment> {
	private readonly logger = new Logger(EnvironmentService.name)

	constructor(
		@InjectRepository(Environment)
		readonly repository: Repository<Environment>
	) {
		super(repository)
	}
}
