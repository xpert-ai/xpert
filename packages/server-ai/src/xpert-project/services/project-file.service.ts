import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { I18nService } from 'nestjs-i18n'
import { Repository } from 'typeorm'
import { XpertProjectFile } from '../entities/project-file.entity'

@Injectable()
export class XpertProjectFileService extends TenantOrganizationAwareCrudService<XpertProjectFile> {
	readonly #logger = new Logger(XpertProjectFileService.name)

	constructor(
		@InjectRepository(XpertProjectFile)
		repository: Repository<XpertProjectFile>,
		private readonly i18n: I18nService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(repository)
	}
}
