import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { I18nService } from 'nestjs-i18n'
import { Repository } from 'typeorm'
import { XpertProjectFile } from '../entities/project-file.entity'

/**
 * @deprecated
 */
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

	async readFile(id: string, filePath: string) {
		this.#logger.log(`Reading file: ${filePath} for project file ID: ${id}`);

		const projectFile = await this.findOneByWhereOptions({
			projectId: id,
			filePath
		})
		if (!projectFile) {
			this.#logger.error(`Project file with ID ${id} not found`);
			throw new NotFoundException(await this.i18n.t('errors.project_file_not_found'));
		}

		return projectFile
	}
}
