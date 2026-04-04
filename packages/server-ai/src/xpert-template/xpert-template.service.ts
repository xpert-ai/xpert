import { IXpertMCPTemplate, LanguagesEnum, TKnowledgePipelineTemplate } from '@metad/contracts'
import { getErrorMessage, omit } from '@metad/server-common'
import { ConfigService } from '@metad/server-config'
import { PaginationParams, TenantAwareCrudService } from '@metad/server-core'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Cache } from 'cache-manager'
import * as fs from 'fs'
import { isNil } from 'lodash'
import * as path from 'path'
import { In, Repository } from 'typeorm'
import { XpertTemplate } from './xpert-template.entity'

const builtinTemplatePath = 'packages/server-ai/src/xpert-template'
const fallbackLanguage = 'en-US'
const templateDirectoryName = 'xpert-template'
const templateDirectories = ['templates', 'pipelines'] as const
const templateFiles = ['templates.json', 'mcp-templates.json', 'knowledge-pipelines.json'] as const

type TXpertTemplateDescriptor = {
	id: string
	name?: string
	export_data?: string
	[key: string]: any
}

type TXpertTemplateGroup = {
	categories?: string[]
	recommendedApps: TXpertTemplateDescriptor[]
}

type TXpertTemplatesCatalog = {
	templates: Record<string, TXpertTemplateGroup>
	details: Record<string, TXpertTemplateDescriptor>
}

type TLocalizedTemplates<T> = Record<string, { categories?: string[]; templates: T[] }>

@Injectable()
export class XpertTemplateService extends TenantAwareCrudService<XpertTemplate> implements OnModuleInit {
	readonly #logger = new Logger(XpertTemplateService.name)

	@Inject(ConfigService)
	protected readonly configService: ConfigService

	@Inject(CACHE_MANAGER)
	private readonly cacheManager: Cache

	private templateDirectoryReady?: Promise<string>

	constructor(
		@InjectRepository(XpertTemplate)
		readonly xtRepository: Repository<XpertTemplate>,
	) {
		super(xtRepository)
	}

	async onModuleInit() {
		await this.ensureTemplateDirectoryReady()
	}

	async readTemplatesFile(): Promise<TXpertTemplatesCatalog> {
		const templatesFilePath = await this.getExternalTemplatePath('templates.json')
		return this.readJsonFromFile<TXpertTemplatesCatalog>(templatesFilePath)
	}

	async getAll(language: LanguagesEnum) {
		const templatesData = await this.readTemplatesFile()
		if (templatesData.templates[language]?.recommendedApps?.length) {
			return templatesData.templates[language]
		}
		return templatesData.templates[fallbackLanguage]
	}

	async getTemplateDetail(id: string, language: LanguagesEnum) {
		const templatesData = await this.readTemplatesFile()
		let details = templatesData.details[id]
		if (details) {
			return details
		}

		const recommendedApps = templatesData.templates[language]?.recommendedApps?.length
			? templatesData.templates[language].recommendedApps
			: templatesData.templates[fallbackLanguage].recommendedApps
		details = recommendedApps.find((_) => _.id === id)

		if (!details) {
			throw new Error(`Unable to find template for ${id}`)
		}

		const templateFilePath = await this.getExternalTemplatePath('templates', `${id}.yaml`)
		details.export_data = await this.readTextFromFile(templateFilePath, `template '${id}'`)

		return details
	}

	async readTemplates<T>(fileName: string, cacheKey: string): Promise<TLocalizedTemplates<T>> {
		let templatesData = await this.cacheManager.get<TLocalizedTemplates<T>>(cacheKey)
		if (templatesData) {
			return templatesData
		}

		const templatesFilePath = await this.getExternalTemplatePath(fileName)
		templatesData = await this.readJsonFromFile<TLocalizedTemplates<T>>(templatesFilePath)

		await this.cacheManager.set(cacheKey, templatesData, 10 * 1000)

		return templatesData
	}

	/**
	 *
	 * @deprecated use readTemplates
	 */
	async readMCPTemplates() {
		return this.readTemplates<IXpertMCPTemplate>('mcp-templates.json', 'xpert:mcp-templates')
	}

	async getMCPTemplates(language: LanguagesEnum, paginationParams: PaginationParams<XpertTemplate>) {
		const data = await this.readMCPTemplates()

		let template = null
		if (data[language]?.['templates']?.length) {
			template = data[language]
		} else {
			template = data[fallbackLanguage]
		}

		const ids = template.templates.map((_) => _.id)
		const { items } = await this.findAll({ where: { key: In(ids) } })
		template.templates.forEach((temp) => {
			temp.visitCount = items.find((_) => _.key === temp.id)?.visitCount
		})

		const quota = 20
		template.templates = template.templates.sort(
			(a, b) =>
				(b.visitCount < quota ? Number.MAX_SAFE_INTEGER : b.visitCount) -
				(a.visitCount < quota ? Number.MAX_SAFE_INTEGER : a.visitCount)
		)

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
			templates = data[fallbackLanguage]['templates']
		}

		const temp = templates?.find((_) => _.id === key)
		if (temp) {
			const { record } = await this.findOneOrFailByWhereOptions({ key: temp.id })
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
		const data = await this.readTemplates<TKnowledgePipelineTemplate>(
			'knowledge-pipelines.json',
			'xpert:knowledge-pipelines'
		)

		let template = null
		if (data[language]?.['templates']?.length) {
			template = data[language]
		} else {
			template = data[fallbackLanguage]
		}

		const ids = template.templates.map((_) => _.id)
		const { items } = await this.findAll({ where: { key: In(ids) } })
		template.templates.forEach((temp) => {
			temp.visitCount = items.find((_) => _.key === temp.id)?.visitCount
		})

		const quota = 20
		template.templates = template.templates.sort(
			(a, b) =>
				(b.visitCount < quota ? Number.MAX_SAFE_INTEGER : b.visitCount) -
				(a.visitCount < quota ? Number.MAX_SAFE_INTEGER : a.visitCount)
		)

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

	async getKnowledgePipeline(language: LanguagesEnum, id: string) {
		const data = await this.readTemplates<TKnowledgePipelineTemplate>(
			'knowledge-pipelines.json',
			'xpert:knowledge-pipelines'
		)

		let template = null
		if (data[language]?.['templates']?.length) {
			template = data[language]
		} else {
			template = data[fallbackLanguage]
		}

		const temp = template.templates?.find((_) => _.id === id)
		if (!temp) {
			throw new Error(`Unable to find knowledge pipeline for ${id}`)
		}

		const { record } = await this.findOneOrFailByWhereOptions({ key: temp.id })
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

		const templateFilePath = await this.getExternalTemplatePath('pipelines', `${id}.yaml`)
		temp.export_data = await this.readTextFromFile(templateFilePath, `knowledge pipeline '${id}'`)

		return temp
	}

	private ensureTemplateDirectoryReady() {
		if (!this.templateDirectoryReady) {
			this.templateDirectoryReady = this.initializeTemplateDirectory().catch((error) => {
				this.templateDirectoryReady = undefined
				throw error
			})
		}

		return this.templateDirectoryReady
	}

	private async initializeTemplateDirectory() {
		const builtinRoot = this.getBuiltinTemplateRoot()
		const externalRoot = this.getExternalTemplateRoot()

		await this.assertBuiltinTemplateSource(builtinRoot, externalRoot)
		await this.assertBuiltinTemplateLayout(builtinRoot, externalRoot)
		await fs.promises.mkdir(externalRoot, { recursive: true })

		for (const directoryName of templateDirectories) {
			await fs.promises.mkdir(path.join(externalRoot, directoryName), { recursive: true })
		}

		for (const fileName of templateFiles) {
			await this.copyFileIfMissing(
				path.join(builtinRoot, fileName),
				path.join(externalRoot, fileName),
				externalRoot
			)
		}

		for (const directoryName of templateDirectories) {
			await this.copyDirectoryContentsIfMissing(
				path.join(builtinRoot, directoryName),
				path.join(externalRoot, directoryName),
				externalRoot
			)
		}

		await this.assertExternalTemplateLayout(externalRoot)
		this.#logger.log(`Xpert templates ready at '${externalRoot}'`)

		return externalRoot
	}

	private getBuiltinTemplateRoot() {
		return path.join(this.configService.assetOptions.serverRoot, builtinTemplatePath)
	}

	private getExternalTemplateRoot() {
		const configuredPath = this.configService.environment.env?.XPERT_TEMPLATE_DIR?.trim()
		return configuredPath || path.join(this.configService.assetOptions.dataPath, templateDirectoryName)
	}

	private async getExternalTemplatePath(...segments: string[]) {
		const templateRoot = await this.ensureTemplateDirectoryReady()
		return path.join(templateRoot, ...segments)
	}

	private async assertBuiltinTemplateSource(builtinRoot: string, externalRoot: string) {
		try {
			const stats = await fs.promises.stat(builtinRoot)
			if (!stats.isDirectory()) {
				throw new Error('Expected a directory')
			}
			await fs.promises.access(builtinRoot, fs.constants.R_OK)
		} catch (error) {
			throw new Error(
				`Built-in xpert template source '${builtinRoot}' is unavailable while initializing '${externalRoot}': ${getErrorMessage(error)}`
			)
		}
	}

	private async assertBuiltinTemplateLayout(builtinRoot: string, externalRoot: string) {
		for (const fileName of templateFiles) {
			await this.assertPathAvailable(
				path.join(builtinRoot, fileName),
				'file',
				externalRoot,
				'Built-in xpert template file is unavailable'
			)
		}

		for (const directoryName of templateDirectories) {
			await this.assertPathAvailable(
				path.join(builtinRoot, directoryName),
				'directory',
				externalRoot,
				'Built-in xpert template directory is unavailable'
			)
		}
	}

	private async assertExternalTemplateLayout(externalRoot: string) {
		for (const fileName of templateFiles) {
			await this.assertPathAvailable(
				path.join(externalRoot, fileName),
				'file',
				externalRoot,
				'Required xpert template file is unavailable'
			)
		}

		for (const directoryName of templateDirectories) {
			await this.assertPathAvailable(
				path.join(externalRoot, directoryName),
				'directory',
				externalRoot,
				'Required xpert template directory is unavailable'
			)
		}
	}

	private async assertPathAvailable(
		targetPath: string,
		kind: 'file' | 'directory',
		templateRoot: string,
		message: string
	) {
		try {
			const stats = await fs.promises.stat(targetPath)
			if (kind === 'file' && !stats.isFile()) {
				throw new Error('Expected a file')
			}
			if (kind === 'directory' && !stats.isDirectory()) {
				throw new Error('Expected a directory')
			}
			await fs.promises.access(targetPath, fs.constants.R_OK)
		} catch (error) {
			throw new Error(`${message} at '${targetPath}' (xpert template dir: '${templateRoot}'): ${getErrorMessage(error)}`)
		}
	}

	private async copyFileIfMissing(sourcePath: string, targetPath: string, templateRoot: string) {
		if (await this.pathExists(targetPath)) {
			return
		}
		try {
			await fs.promises.copyFile(sourcePath, targetPath)
		} catch (error) {
			throw new Error(
				`Failed to seed xpert template asset from '${sourcePath}' to '${targetPath}' (xpert template dir: '${templateRoot}'): ${getErrorMessage(error)}`
			)
		}
	}

	private async copyDirectoryContentsIfMissing(
		sourceDirectory: string,
		targetDirectory: string,
		templateRoot: string
	) {
		let entries: fs.Dirent[]
		try {
			entries = await fs.promises.readdir(sourceDirectory, { withFileTypes: true })
		} catch (error) {
			throw new Error(
				`Failed to read built-in xpert template directory '${sourceDirectory}' while seeding '${targetDirectory}' (xpert template dir: '${templateRoot}'): ${getErrorMessage(error)}`
			)
		}

		for (const entry of entries) {
			const sourcePath = path.join(sourceDirectory, entry.name)
			const targetPath = path.join(targetDirectory, entry.name)

			if (entry.isDirectory()) {
				await fs.promises.mkdir(targetPath, { recursive: true })
				await this.copyDirectoryContentsIfMissing(sourcePath, targetPath, templateRoot)
				continue
			}

			await this.copyFileIfMissing(sourcePath, targetPath, templateRoot)
		}
	}

	private async pathExists(targetPath: string) {
		try {
			await fs.promises.access(targetPath, fs.constants.F_OK)
			return true
		} catch {
			return false
		}
	}

	private async readJsonFromFile<T>(filePath: string) {
		try {
			const data = await fs.promises.readFile(filePath, 'utf8')
			return JSON.parse(data) as T
		} catch (error) {
			this.#logger.error(`Failed to read xpert template file '${filePath}'`, error instanceof Error ? error.stack : undefined)
			throw new Error(
				`Failed to read xpert template file '${filePath}' (xpert template dir: '${this.getExternalTemplateRoot()}'): ${getErrorMessage(error)}`
			)
		}
	}

	private async readTextFromFile(filePath: string, description: string) {
		try {
			return await fs.promises.readFile(filePath, 'utf8')
		} catch (error) {
			throw new Error(
				`Failed to read ${description} at '${filePath}' (xpert template dir: '${this.getExternalTemplateRoot()}'): ${getErrorMessage(error)}`
			)
		}
	}
}
