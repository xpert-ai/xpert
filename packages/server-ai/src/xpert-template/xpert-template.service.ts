import { LanguagesEnum } from '@metad/contracts'
import { ConfigService } from '@metad/server-config'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import * as fs from 'fs'
import * as path from 'path'

const currentPath = 'packages/server-ai/src/xpert-template'

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
			currentPath + '/templates.json'
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
		if (templatesData.templates[language]?.recommendedApps?.length) {
			return templatesData.templates[language]
		}
		return templatesData.templates['en-US']
		
	}

	async getTemplateDetail(id: string, language: LanguagesEnum) {
		const templatesData = await this.readTemplatesFile()
		let details = templatesData.details[id]
		if (details) {
			return details
		}

		const recommendedApps = templatesData.templates[language]?.recommendedApps?.length
			? templatesData.templates[language].recommendedApps
			: templatesData.templates['en-US'].recommendedApps
		details = recommendedApps.find((_) => _.id === id)

		if (!details) {
			throw new Error(`Unable to find template for ${id}`)
		}

		const templateFilePath = path.join(
			this.configService.assetOptions.serverRoot,
			currentPath + `/templates/${id}.yaml`
		)

		try {
			details.export_data = await fs.promises.readFile(templateFilePath, 'utf8')
		} catch (err) {
			throw new Error(`Unable to find template for ${id}`)
		}

		return details
	}
}
