import { IXpertMCPTemplate, LanguagesEnum, TKnowledgePipelineTemplate } from '@metad/contracts'
import { omit } from '@metad/server-common'
import { ConfigService } from '@metad/server-config'
import { PaginationParams, TenantAwareCrudService } from '@metad/server-core'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Cache } from 'cache-manager'
import * as fs from 'fs'
import { isNil } from 'lodash'
import * as path from 'path'
import { In, Repository } from 'typeorm'
import { XpertTemplate } from './xpert-template.entity'

const currentPath = 'packages/server-ai/src/xpert-template'

@Injectable()
export class XpertTemplateService extends TenantAwareCrudService<XpertTemplate> {
	readonly #logger = new Logger(XpertTemplateService.name)

	@Inject(ConfigService)
	protected readonly configService: ConfigService

	@Inject(CACHE_MANAGER)
	private readonly cacheManager: Cache

	constructor(
		@InjectRepository(XpertTemplate)
		readonly xtRepository: Repository<XpertTemplate>,
	) {
		super(xtRepository)
	}

	async readTemplatesFile() {
		const templatesFilePath = path.join(this.configService.assetOptions.serverRoot, currentPath + '/templates.json')

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

	async readTemplates<T>(fileName: string, cacheKey: string) {
		let templatesData: { templates: T[] }
		// const cacheKey = `xpert:mcp-templates`
		templatesData = await this.cacheManager.get(cacheKey)
		if (templatesData) {
			return templatesData
		}

		const templatesFilePath = path.join(
			this.configService.assetOptions.serverRoot,
			currentPath + '/' + fileName
		)

		try {
			const data = fs.readFileSync(templatesFilePath, 'utf8')
			templatesData = JSON.parse(data)
		} catch (err) {
			this.#logger.error(`Error reading ${fileName}:`, err)
			throw new Error(`Failed to read ${fileName}`)
		}

		await this.cacheManager.set(cacheKey, templatesData, 10 * 1000 /** 10s timeout */)

		return templatesData
	}

	/**
	 * 
	 * @deprecated use readTemplates
	 */
	async readMCPTemplates() {
		let templatesData: { templates: IXpertMCPTemplate[] }
		const cacheKey = `xpert:mcp-templates`
		templatesData = await this.cacheManager.get(cacheKey)
		if (templatesData) {
			return templatesData
		}

		const templatesFilePath = path.join(
			this.configService.assetOptions.serverRoot,
			currentPath + '/mcp-templates.json'
		)

		try {
			const data = fs.readFileSync(templatesFilePath, 'utf8')
			templatesData = JSON.parse(data)
		} catch (err) {
			this.#logger.error('Error reading mcp-templates.json:', err)
			throw new Error('Failed to read mcp-templates.json')
		}

		await this.cacheManager.set(cacheKey, templatesData, 10 * 1000 /** 10s timeout */)

		return templatesData
	}

	async getMCPTemplates(language: LanguagesEnum, paginationParams: PaginationParams<XpertTemplate>) {
		const data = await this.readMCPTemplates()

		let template = null
		if (data[language]?.['templates']?.length) {
			template = data[language]
		} else {
			template = data['en-US']
		}

		// Query visits
		const ids = template.templates.map((_) => _.id)
		const { items } = await this.findAll({ where: { key: In(ids) } })
		template.templates.forEach((temp) => {
			temp.visitCount = items.find((_) => _.key === temp.id)?.visitCount
		})

		// Sort the templates by visitCount desc. If visitCount is empty, sort first
		const quota = 20
		template.templates = template.templates.sort((a, b) => (b.visitCount < quota ? Number.MAX_SAFE_INTEGER : b.visitCount) - (a.visitCount < quota ? Number.MAX_SAFE_INTEGER : a.visitCount))

		if (!isNil(paginationParams?.take)) {
			template = {
				...template,
				templates: template.templates.slice(
					paginationParams.skip ?? 0,
					(paginationParams.skip ?? 0) + paginationParams.take
				)
			}
		}

		return {
			...template,
			templates: template.templates.map((_) => omit(_, 'server', 'options'))
		}
	}

	async getMCPTemplate(language: LanguagesEnum, key: string) {
		const data = await this.readMCPTemplates()

		let templates = null
		if (data[language]?.['templates']?.length) {
			templates = data[language]['templates']
		} else {
			templates = data['en-US']['templates']
		}

		const temp = templates?.find((_) => _.id === key)
		if (temp) {
			const {record} = await this.findOneOrFail({ where: { key: temp.id } })
			if (!record) {
				await this.create({
					key: temp.id,
					name: temp.name,
					visitCount: 1,
					lastVisitedAt: new Date()
				})
			} else {
				await this.update(record.id, { visitCount: record.visitCount + 1, lastVisitedAt: new Date() })
			}
		}
		return temp
	}

	async getKnowledgePipelines(language: LanguagesEnum, paginationParams: PaginationParams<XpertTemplate>) {
		const data = await this.readTemplates<TKnowledgePipelineTemplate>('knowledge-pipelines.json', 'xpert:knowledge-pipelines')

		let template = null
		if (data[language]?.['templates']?.length) {
			template = data[language]
		} else {
			template = data['en-US']
		}

		// Query visits
		const ids = template.templates.map((_) => _.id)
		const { items } = await this.findAll({ where: { key: In(ids) } })
		template.templates.forEach((temp) => {
			temp.visitCount = items.find((_) => _.key === temp.id)?.visitCount
		})

		// Sort the templates by visitCount desc. If visitCount is empty, sort first
		const quota = 20
		template.templates = template.templates.sort((a, b) => (b.visitCount < quota ? Number.MAX_SAFE_INTEGER : b.visitCount) - (a.visitCount < quota ? Number.MAX_SAFE_INTEGER : a.visitCount))

		if (!isNil(paginationParams?.take)) {
			template = {
				...template,
				templates: template.templates.slice(
					paginationParams.skip ?? 0,
					(paginationParams.skip ?? 0) + paginationParams.take
				)
			}
		}

		return {
			...template,
			templates: template.templates
		}
	}
}
