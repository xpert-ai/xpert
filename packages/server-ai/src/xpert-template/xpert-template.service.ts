import { LanguagesEnum } from '@metad/contracts'
import { ConfigService } from '@metad/server-config'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import * as fs from 'fs'
import * as path from 'path'

@Injectable()
export class XpertTemplateService {
	readonly #logger = new Logger(XpertTemplateService.name)

	@Inject(ConfigService)
	protected readonly configService: ConfigService

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	async readTemplatesFile() {
		const templatesFilePath = path.join(
			this.configService.assetOptions.serverRoot,
			'packages/server-ai/src/xpert-template/templates.json'
		)

		let templatesData: Record<string, unknown>

		try {
			const data = fs.readFileSync(templatesFilePath, 'utf8')
			templatesData = JSON.parse(data)
		} catch (err) {
			this.#logger.error('Error reading templates.json:', err)
			throw new Error('Failed to read templates.json')
		}

		return templatesData
	}

	async getAll(language: LanguagesEnum) {
		const templatesData = await this.readTemplatesFile()
		if (templatesData.templates[language]?.recommended_apps?.length) {
			return templatesData.templates[language]
		}
		return templatesData.templates['en-US']
		
	}

	async getTemplateDetail(id: string) {
		const templatesData = await this.readTemplatesFile()

		return templatesData.details[id]
	}
}
