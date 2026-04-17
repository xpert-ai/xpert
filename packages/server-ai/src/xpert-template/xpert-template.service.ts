import {
	IconDefinition,
	ISkillMarketConfig,
	ISkillMarketFeaturedRef,
	ISkillMarketFeaturedSkill,
	ISkillMarketFilterGroup,
	ISkillMarketFilterGroups,
	ISkillRepositoryIndex,
	ISkillRepository,
	IXpertMCPTemplate,
	LanguagesEnum,
	WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER,
	TKnowledgePipelineTemplate
} from '@xpert-ai/contracts'
import { getErrorMessage, omit, yaml } from '@xpert-ai/server-common'
import { ConfigService } from '@xpert-ai/server-config'
import { PaginationParams, TenantAwareCrudService } from '@xpert-ai/server-core'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Cache } from 'cache-manager'
import * as fs from 'fs'
import { isNil } from 'lodash'
import * as path from 'path'
import { In, Repository } from 'typeorm'
import { SkillRepositoryService } from '../skill-repository/skill-repository.service'
import { SkillRepositoryIndexService } from '../skill-repository/repository-index/skill-repository-index.service'
import { XpertTemplate } from './xpert-template.entity'

const builtinTemplatePath = 'packages/server-ai/src/xpert-template'
const fallbackLanguage = 'en-US'
const templateDirectoryName = 'xpert-template'
const templateDirectories = ['templates', 'pipelines', 'skill-packages'] as const
const templateFiles = [
	'templates.json',
	'mcp-templates.json',
	'knowledge-pipelines.json',
	'skills-market.yaml',
	'skill-repositories.yaml',
	'workspace-defaults.yaml'
] as const

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

type TSkillMarketLocaleConfig = {
	featured: ISkillMarketFeaturedRef[]
	filters: ISkillMarketFilterGroups
}

type TLocalizedSkillMarketCatalog = Record<string, TSkillMarketLocaleConfig>

export type TDefaultSkillRepositoryEntry = Pick<ISkillRepository, 'name' | 'provider'> &
	Partial<Pick<ISkillRepository, 'options' | 'credentials'>>

export type TDefaultSkillRepositoriesConfig = {
	repositories: TDefaultSkillRepositoryEntry[]
}

export type TWorkspaceDefaultSkillRef = {
	provider: string
	repositoryName: string
	skillId: string
}

export type TWorkspaceDefaultsConfig = {
	userDefault: {
		skills: TWorkspaceDefaultSkillRef[]
	}
}

export type TResolvedSkillRef = {
	ref: TWorkspaceDefaultSkillRef
	skill: ISkillRepositoryIndex
}

export type TTemplateSkillBundle = {
	ref: TWorkspaceDefaultSkillRef
	directoryName: string
	directoryPath: string
	sharedSkillId: string
}

const DEFAULT_SKILL_MARKET_FILTERS: ISkillMarketFilterGroups = {
	roles: {
		label: 'Roles',
		options: []
	},
	appTypes: {
		label: 'Application types',
		options: []
	},
	hot: {
		label: 'Trending',
		options: []
	}
}

const TEMPLATE_SKILL_BUNDLE_MANIFEST_FILE = 'bundle.yaml'
const TEMPLATE_SKILL_BUNDLE_SEPARATOR = '__'
const TEMPLATE_SKILL_BUNDLE_SHARED_PREFIX = 'template-bundle'

const isObjectValue = (value: unknown): value is object =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const isOptionalString = (value: unknown): value is string | undefined =>
	typeof value === 'undefined' || typeof value === 'string'

const isOptionalNumber = (value: unknown): value is number | undefined =>
	typeof value === 'undefined' || (typeof value === 'number' && Number.isFinite(value))

const isStringRecord = (value: unknown): value is NonNullable<IconDefinition['style']> =>
	isObjectValue(value) && Object.values(value).every((item) => typeof item === 'string')

const SKILL_MARKET_ICON_TYPES: IconDefinition['type'][] = ['image', 'svg', 'font', 'emoji', 'lottie']

const isIconType = (value: unknown): value is IconDefinition['type'] =>
	typeof value === 'string' && SKILL_MARKET_ICON_TYPES.some((type) => type === value)

const isIconDefinition = (value: unknown): value is IconDefinition => {
	if (!isObjectValue(value)) {
		return false
	}

	const type = Reflect.get(value, 'type')
	const iconValue = Reflect.get(value, 'value')

	return (
		isIconType(type) &&
		typeof iconValue === 'string' &&
		!!iconValue.trim() &&
		isOptionalString(Reflect.get(value, 'color')) &&
		isOptionalNumber(Reflect.get(value, 'size')) &&
		isOptionalString(Reflect.get(value, 'alt')) &&
		(typeof Reflect.get(value, 'style') === 'undefined' || isStringRecord(Reflect.get(value, 'style')))
	)
}

const isOptionalIconDefinition = (value: unknown): value is IconDefinition | undefined =>
	typeof value === 'undefined' || isIconDefinition(value)

const normalizeIconDefinition = (value: IconDefinition): IconDefinition => ({
	type: value.type,
	value: value.value.trim(),
	...(value.color?.trim() ? { color: value.color.trim() } : {}),
	...(typeof value.size === 'number' ? { size: value.size } : {}),
	...(value.alt?.trim() ? { alt: value.alt.trim() } : {}),
	...(value.style ? { style: { ...value.style } } : {})
})

const isSkillMarketFeaturedRef = (value: unknown): value is ISkillMarketFeaturedRef =>
	isObjectValue(value) &&
	typeof Reflect.get(value, 'provider') === 'string' &&
	typeof Reflect.get(value, 'repositoryName') === 'string' &&
	typeof Reflect.get(value, 'skillId') === 'string' &&
	isOptionalString(Reflect.get(value, 'badge')) &&
	isOptionalString(Reflect.get(value, 'title')) &&
	isOptionalString(Reflect.get(value, 'description')) &&
	isOptionalIconDefinition(Reflect.get(value, 'avatar'))

const isSkillMarketFilterOption = (value: unknown): value is ISkillMarketFilterGroup['options'][number] =>
	isObjectValue(value) &&
	typeof Reflect.get(value, 'value') === 'string' &&
	typeof Reflect.get(value, 'label') === 'string' &&
	isOptionalString(Reflect.get(value, 'description'))

const isSkillMarketFilterGroup = (value: unknown): value is ISkillMarketFilterGroup =>
	isObjectValue(value) &&
	typeof Reflect.get(value, 'label') === 'string' &&
	Array.isArray(Reflect.get(value, 'options')) &&
	(Reflect.get(value, 'options') as unknown[]).every(isSkillMarketFilterOption)

const isWorkspaceDefaultSkillRef = (value: unknown): value is TWorkspaceDefaultSkillRef =>
	isObjectValue(value) &&
	typeof Reflect.get(value, 'provider') === 'string' &&
	typeof Reflect.get(value, 'repositoryName') === 'string' &&
	typeof Reflect.get(value, 'skillId') === 'string'

const isOptionalRepositoryPayload = (value: unknown): value is ISkillRepository['options'] | null | undefined =>
	typeof value === 'undefined' || value === null || isObjectValue(value)

const isDefaultSkillRepositoryEntry = (value: unknown): value is TDefaultSkillRepositoryEntry =>
	isObjectValue(value) &&
	typeof Reflect.get(value, 'name') === 'string' &&
	typeof Reflect.get(value, 'provider') === 'string' &&
	isOptionalRepositoryPayload(Reflect.get(value, 'options')) &&
	isOptionalRepositoryPayload(Reflect.get(value, 'credentials'))

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
		private readonly skillRepositoryService: SkillRepositoryService,
		private readonly skillRepositoryIndexService: SkillRepositoryIndexService,
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

	async getSkillsMarket(language: LanguagesEnum): Promise<ISkillMarketConfig> {
		const catalog = await this.readSkillsMarketCatalog()
		const localeConfig = catalog[language] ?? catalog[fallbackLanguage] ?? {
			featured: [],
			filters: DEFAULT_SKILL_MARKET_FILTERS
		}
		const featured = await this.resolveFeaturedSkills(localeConfig.featured)

		return {
			featured,
			filters: localeConfig.filters
		}
	}

	async readSkillsMarketCatalog(): Promise<TLocalizedSkillMarketCatalog> {
		let config = await this.cacheManager.get<TLocalizedSkillMarketCatalog>('xpert:skills-market')
		if (config) {
			return config
		}

		const filePath = await this.getExternalTemplatePath('skills-market.yaml')
		const raw = await this.readYamlFromFile(filePath, 'skills market config')
		config = this.normalizeSkillMarketCatalog(raw)
		await this.cacheManager.set('xpert:skills-market', config, 10 * 1000)

		return config
	}

	async readSkillRepositories(): Promise<TDefaultSkillRepositoriesConfig> {
		let config = await this.cacheManager.get<TDefaultSkillRepositoriesConfig>('xpert:skill-repositories')
		if (config) {
			return config
		}

		const filePath = await this.getExternalTemplatePath('skill-repositories.yaml')
		const raw = await this.readYamlFromFile(filePath, 'skill repositories config')
		config = this.normalizeSkillRepositories(raw)
		await this.cacheManager.set('xpert:skill-repositories', config, 10 * 1000)

		return config
	}

	async readWorkspaceDefaults(): Promise<TWorkspaceDefaultsConfig> {
		let config = await this.cacheManager.get<TWorkspaceDefaultsConfig>('xpert:workspace-defaults')
		if (config) {
			return config
		}

		const filePath = await this.getExternalTemplatePath('workspace-defaults.yaml')
		const raw = await this.readYamlFromFile(filePath, 'workspace defaults config')
		config = this.normalizeWorkspaceDefaults(raw)
		await this.cacheManager.set('xpert:workspace-defaults', config, 10 * 1000)

		return config
	}

	async getUserDefaultSkillRefs(): Promise<TWorkspaceDefaultSkillRef[]> {
		const config = await this.readWorkspaceDefaults()
		if (!config.userDefault.skills.length) {
			return []
		}

		const featuredRefsByKey = await this.getSkillsMarketFeaturedRefsByKey()
		const matchedRefs: TWorkspaceDefaultSkillRef[] = []
		const missingRefs: TWorkspaceDefaultSkillRef[] = []

		for (const ref of config.userDefault.skills) {
			const key = this.getSkillRefKey(ref)
			const featuredRef = featuredRefsByKey.get(key)
			if (featuredRef) {
				matchedRefs.push(featuredRef)
				continue
			}

			missingRefs.push(ref)
		}

		if (missingRefs.length) {
			this.#logger.warn(
				`Skipping workspace default skills missing from skills-market.yaml: ${missingRefs
					.map((ref) => this.getSkillRefKey(ref))
					.join(', ')}`
			)
		}

		return matchedRefs
	}

	async resolveSkillRefs(skillRefs: TWorkspaceDefaultSkillRef[]): Promise<TResolvedSkillRef[]> {
		if (!skillRefs.length) {
			return []
		}

		const repositoriesByKey = await this.getRepositoriesByKey()
		const resolved: TResolvedSkillRef[] = []
		for (const ref of skillRefs) {
			const skill = await this.resolveSkillRef(ref, repositoriesByKey)
			if (skill) {
				resolved.push({
					ref,
					skill
				})
			}
		}

		return resolved
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

	private normalizeSkillMarketCatalog(value: unknown): TLocalizedSkillMarketCatalog {
		if (!isObjectValue(value)) {
			return {
				[fallbackLanguage]: {
					featured: [],
					filters: DEFAULT_SKILL_MARKET_FILTERS
				}
			}
		}

		const locales: TLocalizedSkillMarketCatalog = {}

		for (const [locale, config] of Object.entries(value)) {
			if (!locale.trim() || !isObjectValue(config)) {
				continue
			}

			const featuredValue = Reflect.get(config, 'featured')
			const featured = Array.isArray(featuredValue)
				? featuredValue.filter(isSkillMarketFeaturedRef).map((item) => ({
					provider: item.provider.trim(),
					repositoryName: item.repositoryName.trim(),
					skillId: item.skillId.trim(),
					...(item.badge ? { badge: item.badge.trim() } : {}),
					...(item.title ? { title: item.title.trim() } : {}),
					...(item.description ? { description: item.description.trim() } : {}),
					...(item.avatar ? { avatar: normalizeIconDefinition(item.avatar) } : {})
				}))
				: []

			const filters = this.normalizeSkillMarketFilters(Reflect.get(config, 'filters'))
			locales[locale] = { featured, filters }
		}

		if (locales[fallbackLanguage]) {
			return locales
		}

		return {
			...locales,
			[fallbackLanguage]: {
				featured: [],
				filters: DEFAULT_SKILL_MARKET_FILTERS
			}
		}
	}

	private normalizeSkillMarketFilters(value: unknown): ISkillMarketFilterGroups {
		if (!isObjectValue(value)) {
			return DEFAULT_SKILL_MARKET_FILTERS
		}

		return {
			roles: this.normalizeSkillMarketFilterGroup(Reflect.get(value, 'roles'), DEFAULT_SKILL_MARKET_FILTERS.roles),
			appTypes: this.normalizeSkillMarketFilterGroup(
				Reflect.get(value, 'appTypes'),
				DEFAULT_SKILL_MARKET_FILTERS.appTypes
			),
			hot: this.normalizeSkillMarketFilterGroup(Reflect.get(value, 'hot'), DEFAULT_SKILL_MARKET_FILTERS.hot)
		}
	}

	private normalizeSkillMarketFilterGroup(
		value: unknown,
		fallback: ISkillMarketFilterGroup
	): ISkillMarketFilterGroup {
		if (!isSkillMarketFilterGroup(value)) {
			return fallback
		}

		return {
			label: value.label.trim(),
			options: value.options.map((option) => ({
				value: option.value.trim(),
				label: option.label.trim(),
				...(option.description ? { description: option.description.trim() } : {})
			}))
		}
	}

	private async resolveFeaturedSkills(featuredRefs: ISkillMarketFeaturedRef[]): Promise<ISkillMarketFeaturedSkill[]> {
		if (!featuredRefs.length) {
			return []
		}

		const repositoriesByKey = await this.getRepositoriesByKey()

		const featured: ISkillMarketFeaturedSkill[] = []
		for (const ref of featuredRefs) {
			const skill = await this.resolveSkillRef(ref, repositoriesByKey)
			if (!skill) {
				continue
			}

			featured.push({
				...ref,
				skill
			})
		}

		return featured
	}

	async getTemplateSkillBundles(): Promise<TTemplateSkillBundle[]> {
		let bundles = await this.cacheManager.get<TTemplateSkillBundle[]>('xpert:template-skill-bundles')
		if (bundles) {
			return bundles
		}

		const directoryPath = await this.getExternalTemplatePath('skill-packages')
		const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true }).catch(() => [])
		const bundleCandidates = entries.filter((entry) => entry.isDirectory())
		bundles = (
			await Promise.all(
				bundleCandidates.map((entry) =>
					this.readTemplateSkillBundle(path.join(directoryPath, entry.name), entry.name)
				)
			)
		).filter((bundle): bundle is TTemplateSkillBundle => !!bundle)

		await this.cacheManager.set('xpert:template-skill-bundles', bundles, 10 * 1000)
		return bundles
	}

	private async getSkillsMarketFeaturedRefsByKey() {
		const catalog = await this.readSkillsMarketCatalog()
		const refs = new Map<string, TWorkspaceDefaultSkillRef>()

		for (const localeConfig of Object.values(catalog)) {
			for (const ref of localeConfig.featured) {
				const normalizedRef: TWorkspaceDefaultSkillRef = {
					provider: ref.provider.trim(),
					repositoryName: ref.repositoryName.trim(),
					skillId: ref.skillId.trim()
				}
				const key = this.getSkillRefKey(normalizedRef)
				if (!refs.has(key)) {
					refs.set(key, normalizedRef)
				}
			}
		}

		return refs
	}

	private async getTemplateSkillBundlesByRefKey() {
		const bundles = await this.getTemplateSkillBundles()
		const bundlesByKey = new Map<string, TTemplateSkillBundle>()

		for (const bundle of bundles) {
			const key = this.getSkillRefKey(bundle.ref)
			if (!bundlesByKey.has(key)) {
				bundlesByKey.set(key, bundle)
			}
		}

		return bundlesByKey
	}

	private resolveFeaturedSkillIds(skillId: string, repository: ISkillRepository) {
		const skillIds = new Set([skillId])
		const options = repository.options

		if (isObjectValue(options)) {
			const repositoryPath = Reflect.get(options, 'path')
			if (typeof repositoryPath === 'string' && repositoryPath.trim()) {
				const normalizedPath = repositoryPath.trim().replace(/^\/+|\/+$/g, '')
				if (normalizedPath && skillId.startsWith(`${normalizedPath}/`)) {
					skillIds.add(skillId.slice(normalizedPath.length + 1))
				}
			}
		}

		return Array.from(skillIds)
	}

	private normalizeWorkspaceDefaults(value: unknown): TWorkspaceDefaultsConfig {
		const normalizedSkills = isObjectValue(value) && isObjectValue(Reflect.get(value, 'userDefault'))
			? Reflect.get(Reflect.get(value, 'userDefault'), 'skills')
			: undefined

		const skills = Array.isArray(normalizedSkills)
			? normalizedSkills.filter(isWorkspaceDefaultSkillRef).map((item) => ({
				provider: item.provider.trim(),
				repositoryName: item.repositoryName.trim(),
				skillId: item.skillId.trim()
			})).filter((item) => item.provider && item.repositoryName && item.skillId)
			: []

		return {
			userDefault: {
				skills
			}
		}
	}

	private normalizeSkillRepositories(value: unknown): TDefaultSkillRepositoriesConfig {
		const normalizedRepositories = isObjectValue(value) ? Reflect.get(value, 'repositories') : undefined
		const repositories = Array.isArray(normalizedRepositories)
			? normalizedRepositories
					.filter(isDefaultSkillRepositoryEntry)
					.map((item) => ({
						name: item.name.trim(),
						provider: item.provider.trim(),
						...(typeof item.options !== 'undefined' ? { options: item.options } : {}),
						...(typeof item.credentials !== 'undefined' ? { credentials: item.credentials } : {})
					}))
					.filter((item) => item.name && item.provider)
			: []

		return { repositories }
	}

	private async getRepositoriesByKey() {
		const { items: repositories } = await this.skillRepositoryService.findAllInOrganizationOrTenant()
		const repositoriesByKey = new Map<string, ISkillRepository>()

		for (const repository of repositories) {
			const key = `${repository.provider}:${repository.name}`
			const existing = repositoriesByKey.get(key)
			if (!existing) {
				repositoriesByKey.set(key, repository)
				continue
			}

			if (!existing.organizationId && repository.organizationId) {
				repositoriesByKey.set(key, repository)
			}
		}

		return repositoriesByKey
	}

	private async resolveSkillRef(
		ref: Pick<ISkillMarketFeaturedRef, 'provider' | 'repositoryName' | 'skillId'>,
		repositoriesByKey: Map<string, ISkillRepository>
	) {
		const bundledSkill = await this.resolveBundledSkillRef(ref, repositoriesByKey)
		if (bundledSkill) {
			return bundledSkill
		}

		const repository = repositoriesByKey.get(`${ref.provider}:${ref.repositoryName}`)
		if (!repository?.id) {
			return null
		}

		for (const skillId of this.resolveFeaturedSkillIds(ref.skillId, repository)) {
			const { items } = await this.skillRepositoryIndexService.findAllInOrganizationOrTenant({
				where: {
					repositoryId: repository.id,
					skillId
				},
				relations: ['repository'],
				take: 1,
				order: {
					updatedAt: 'DESC'
				}
			})
			if (items[0]) {
				return items[0]
			}
		}

		return null
	}

	private async resolveBundledSkillRef(
		ref: Pick<ISkillMarketFeaturedRef, 'provider' | 'repositoryName' | 'skillId'>,
		repositoriesByKey: Map<string, ISkillRepository>
	) {
		const bundlesByKey = await this.getTemplateSkillBundlesByRefKey()
		const bundle = bundlesByKey.get(this.getSkillRefKey(ref))
		if (!bundle) {
			return null
		}

		const repository = Array.from(repositoriesByKey.values()).find(
			(candidate) => candidate.provider === WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER
		)
		if (!repository?.id) {
			return null
		}

		const { items } = await this.skillRepositoryIndexService.findAllInOrganizationOrTenant({
			where: {
				repositoryId: repository.id,
				skillId: bundle.sharedSkillId
			},
			relations: ['repository'],
			take: 1,
			order: {
				updatedAt: 'DESC'
			}
		})

		return items[0] ?? null
	}

	private getSkillRefKey(ref: Pick<ISkillMarketFeaturedRef, 'provider' | 'repositoryName' | 'skillId'>) {
		return `${ref.provider}:${ref.repositoryName}:${ref.skillId}`
	}

	private async readTemplateSkillBundle(directoryPath: string, directoryName: string): Promise<TTemplateSkillBundle | null> {
		const manifestPath = path.join(directoryPath, TEMPLATE_SKILL_BUNDLE_MANIFEST_FILE)
		if (!(await this.pathExists(manifestPath))) {
			return null
		}

		const raw = await this.readYamlFromFile(manifestPath, `template skill bundle manifest '${directoryName}'`)
		if (!isWorkspaceDefaultSkillRef(raw)) {
			this.#logger.warn(`Skipping invalid template skill bundle manifest '${manifestPath}'`)
			return null
		}

		const provider = raw.provider.trim()
		const repositoryName = raw.repositoryName.trim()
		const skillId = raw.skillId.trim()
		if (!provider || !repositoryName || !skillId) {
			this.#logger.warn(`Skipping empty template skill bundle manifest '${manifestPath}'`)
			return null
		}

		const ref = {
			provider,
			repositoryName,
			skillId
		} satisfies TWorkspaceDefaultSkillRef

		return {
			directoryName,
			directoryPath,
			ref,
			sharedSkillId: this.buildTemplateSkillBundleSharedSkillId(ref)
		}
	}

	private buildTemplateSkillBundleSharedSkillId(ref: TWorkspaceDefaultSkillRef) {
		return [
			TEMPLATE_SKILL_BUNDLE_SHARED_PREFIX,
			ref.provider,
			this.encodeTemplateSkillBundleSegment(ref.repositoryName),
			this.encodeTemplateSkillBundleSegment(ref.skillId)
		].join(TEMPLATE_SKILL_BUNDLE_SEPARATOR)
	}

	private encodeTemplateSkillBundleSegment(value: string) {
		return encodeURIComponent(value.trim())
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

	private async readYamlFromFile(filePath: string, description: string) {
		try {
			const data = await fs.promises.readFile(filePath, 'utf8')
			return yaml.parse(data)
		} catch (error) {
			throw new Error(
				`Failed to read ${description} at '${filePath}' (xpert template dir: '${this.getExternalTemplateRoot()}'): ${getErrorMessage(error)}`
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
