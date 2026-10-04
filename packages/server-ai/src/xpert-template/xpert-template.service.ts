import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import {
    ISkillMarketConfig,
    ISkillMarketFeaturedRef,
    ISkillMarketFeaturedSkill,
    IXpertMCPTemplate,
    LanguagesEnum,
    TKnowledgePipelineTemplate,
    TXpertExportedTemplate,
    TXpertTemplate,
    TXpertTemplateCatalogQuery
} from '@xpert-ai/contracts'
import {
    GLOBAL_ORGANIZATION_SCOPE,
    RequestContext,
    resolveTenantGlobalScopeKey,
    SYSTEM_GLOBAL_SCOPE,
    XpertTemplateContribution
} from '@xpert-ai/plugin-sdk'
import { getErrorMessage, omit, yaml } from '@xpert-ai/server-common'
import { ConfigService } from '@xpert-ai/server-config'
import { LOADED_PLUGINS, LoadedPluginRecord, PaginationParams, TenantAwareCrudService } from '@xpert-ai/server-core'
import { Cache } from 'cache-manager'
import { createHash } from 'crypto'
import * as fs from 'fs'
import { isNil } from 'lodash'
import * as path from 'path'
import { In, Repository } from 'typeorm'
import { AssistantCapabilityService } from './capabilities/assistant-capability.service'
import { BLANK_ASSISTANT_TEMPLATE_ID } from './capabilities/blank-assistant-template'
import { BOSI_BASE_TEMPLATE_ID, BOSI_TEMPLATE_ID, bosiTemplate } from './capabilities/bosi-template'
import { parseCapabilityTemplateId } from './capabilities/template-capability-reference'
import { EnsureTemplateDirectoryCommand, ResolveTemplateSkillRefsCommand } from './commands'
import {
    describePluginTemplate,
    normalizePluginPackageName,
    TXpertTemplateDescriptor
} from './plugin-template-descriptor'
import { isTemplateCatalogProvider, paginateTemplateCatalog } from './template-catalog'
import { DEFAULT_SKILL_MARKET_FILTERS, exportedXpertTemplateCategory, fallbackLanguage } from './template.constants'
import {
    TDefaultSkillRepositoriesConfig,
    TExportXpertTemplateInput,
    TLocalizedSkillMarketCatalog,
    TLocalizedTemplates,
    TTemplateMarketConfig,
    TTemplateSkillBundle,
    TWorkspaceDefaultsConfig,
    TWorkspaceDefaultSkillRef,
    TXpertTemplateQuery,
    TXpertTemplatesCatalog
} from './template.types'
import {
    createExportedXpertTemplateDescriptor,
    findPluginTemplateById,
    findTemplateDescriptorById,
    getExportedXpertTemplateFilePath,
    getExportedXpertTemplateId,
    getTemplateIdFromFilePath,
    getTemplateOrder,
    matchesTemplateQuery,
    mergeTemplateCategories,
    mergeTemplateCategory,
    mergeTemplateDescriptorDependencies,
    resolveRecommendedTemplates,
    resolveTemplateApplication,
    toXpertTemplate
} from './utils/template-catalog'
import {
    normalizeSkillMarketCatalog,
    normalizeSkillRepositories,
    normalizeTemplatesMarketConfig,
    normalizeWorkspaceDefaults
} from './utils/template-config'
import { appendDirectoryFingerprint, isFileNotFoundError } from './utils/template-files'
import { getBuiltinTemplateRoot, getTemplateRoots } from './utils/template-paths'
import { getSkillRefKey, getTemplateSkillBundles } from './utils/template-skills'
import { XpertTemplate } from './xpert-template.entity'

@Injectable()
export class XpertTemplateService extends TenantAwareCrudService<XpertTemplate> implements OnApplicationBootstrap {
    readonly #logger = new Logger(XpertTemplateService.name)

    @Inject(ConfigService)
    protected readonly configService: ConfigService

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache

    @Inject(AssistantCapabilityService)
    private readonly capabilities: AssistantCapabilityService

    @Inject(CommandBus)
    private readonly commands: CommandBus

    constructor(
        @InjectRepository(XpertTemplate)
        readonly xtRepository: Repository<XpertTemplate>,
        @Optional()
        @Inject(LOADED_PLUGINS)
        private readonly loadedPlugins: LoadedPluginRecord[] = []
    ) {
        super(xtRepository)
    }

    async onApplicationBootstrap() {
        try {
            await this.commands.execute(new EnsureTemplateDirectoryCommand())
        } catch (error) {
            this.#logger.error(
                `Skip xpert template bootstrap during module init: ${getErrorMessage(error)}`,
                error instanceof Error ? error.stack : undefined
            )
        }
    }

    async readTemplatesFile(): Promise<TXpertTemplatesCatalog> {
        const templatesFilePath = await this.getExternalTemplatePath('templates.json')
        return this.readJsonFromFile<TXpertTemplatesCatalog>(templatesFilePath)
    }

    async saveExportedXpertTemplate(input: TExportXpertTemplateInput): Promise<TXpertExportedTemplate> {
        const templateId = getExportedXpertTemplateId(input.xpert.id)
        const filePath = getExportedXpertTemplateFilePath(templateId)
        const absoluteFilePath = await this.resolveExternalRelativePath(filePath)

        await fs.promises.mkdir(path.dirname(absoluteFilePath), { recursive: true })
        await fs.promises.writeFile(absoluteFilePath, input.dslYaml, 'utf8')
        await this.upsertExportedXpertTemplateCatalog(templateId, input.xpert)

        return {
            id: templateId,
            filePath,
            exportedAt: new Date().toISOString(),
            isDraft: input.isDraft,
            includeMemory: input.includeMemory
        }
    }

    async deleteExportedXpertTemplate(
        template?: Pick<TXpertExportedTemplate, 'id' | 'filePath'> | null
    ): Promise<void> {
        if (!template) {
            return
        }

        if (template.filePath?.trim()) {
            const absoluteFilePath = await this.resolveExternalRelativePath(template.filePath)
            try {
                await fs.promises.unlink(absoluteFilePath)
            } catch (error) {
                if (!isFileNotFoundError(error)) {
                    throw error
                }
            }
        }

        const templateId = template.id?.trim() || getTemplateIdFromFilePath(template.filePath)
        if (templateId) {
            await this.removeExportedXpertTemplateCatalog(templateId)
        }
    }

    async getAll(language: LanguagesEnum, query?: TXpertTemplateQuery) {
        const [templatesData, pluginTemplates] = await Promise.all([
            this.readTemplatesFile(),
            this.getPluginTemplates(language, query)
        ])
        const group = templatesData.templates[language]?.recommendedApps?.length
            ? templatesData.templates[language]
            : templatesData.templates[fallbackLanguage]
        const recommendedApps = [...(group?.recommendedApps ?? []), ...pluginTemplates]
            .filter((template) => matchesTemplateQuery(template, query))
            .sort((left, right) => getTemplateOrder(left) - getTemplateOrder(right) || left.id.localeCompare(right.id))

        return {
            ...(group ?? { categories: [], recommendedApps: [] }),
            categories: mergeTemplateCategories(
                group?.categories,
                pluginTemplates.map((template) => template.category)
            ),
            recommendedApps
        }
    }

    async getCatalog(language: LanguagesEnum, query: TXpertTemplateCatalogQuery = {}) {
        const catalog = await this.getAll(language)
        return paginateTemplateCatalog(
            catalog.recommendedApps.map((item) => toXpertTemplate(item)),
            query
        )
    }

    async getMarketplaceRecommendedTemplates(
        language: LanguagesEnum,
        query?: TXpertTemplateQuery
    ): Promise<TXpertTemplate[]> {
        const [templatesData, builtinTemplatesData, marketConfig, pluginTemplates] = await Promise.all([
            this.readTemplatesFile(),
            this.readBuiltinTemplatesFile(),
            this.readTemplatesMarketConfig(),
            this.getPluginTemplates(language, query)
        ])

        return resolveRecommendedTemplates(
            marketConfig.recommendedApps,
            templatesData,
            builtinTemplatesData,
            pluginTemplates,
            language,
            query
        ).map((template) => toXpertTemplate(template))
    }

    async readTemplatesMarketConfig(): Promise<TTemplateMarketConfig> {
        let config = await this.cacheManager.get<TTemplateMarketConfig>('xpert:templates-market')
        if (config) {
            return config
        }

        const filePath = path.join(getBuiltinTemplateRoot(this.configService), 'templates-market.yaml')
        const raw = await this.readYamlFromFile(filePath, 'templates market config')
        config = normalizeTemplatesMarketConfig(raw)
        await this.cacheManager.set('xpert:templates-market', config, 10 * 1000)

        return config
    }

    async getTemplateDetail(id: string, language: LanguagesEnum, query?: TXpertTemplateQuery): Promise<TXpertTemplate> {
        const variant = parseCapabilityTemplateId(id)
        const template = await this.getTemplateSourceDetail(variant?.templateId ?? id, language, query)
        return this.capabilities.compose(toXpertTemplate(template), language, variant?.capabilities ?? [], (sourceId) =>
            this.getTemplateSourceDetail(sourceId, language, query).then((source) => toXpertTemplate(source))
        )
    }

    private async getTemplateSourceDetail(
        id: string,
        language: LanguagesEnum,
        query?: TXpertTemplateQuery
    ): Promise<TXpertTemplateDescriptor> {
        if (id === BOSI_TEMPLATE_ID) {
            const base = await this.getTemplateSourceDetail(BOSI_BASE_TEMPLATE_ID, language, query)
            return bosiTemplate(toXpertTemplate(base))
        }
        if (id === BLANK_ASSISTANT_TEMPLATE_ID) return this.capabilities.blankTemplate()
        const pluginTemplate = await this.getPluginTemplateById(id, language, query)
        if (pluginTemplate) {
            return pluginTemplate
        }

        const templatesData = await this.readTemplatesFile()
        let details = templatesData.details[id]
        details = mergeTemplateDescriptorDependencies(
            details ?? findTemplateDescriptorById(templatesData, id, language),
            await this.findBuiltinTemplateDescriptorById(id, language)
        )

        if (!details) {
            throw new Error(`Unable to find template for ${id}`)
        }

        return this.withTemplateExportData(id, details)
    }

    private async findBuiltinTemplateDescriptorById(
        id: string,
        language: LanguagesEnum
    ): Promise<TXpertTemplateDescriptor | null> {
        const templatesData = await this.readBuiltinTemplatesFile()
        if (!templatesData) {
            return null
        }

        return templatesData.details[id] ?? findTemplateDescriptorById(templatesData, id, language)
    }

    private async readBuiltinTemplatesFile(): Promise<TXpertTemplatesCatalog | null> {
        try {
            const templatesFilePath = path.join(getBuiltinTemplateRoot(this.configService), 'templates.json')
            return await this.readJsonFromFile<TXpertTemplatesCatalog>(templatesFilePath)
        } catch {
            return null
        }
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
        const localeConfig = catalog[language] ??
            catalog[fallbackLanguage] ?? {
                featured: [],
                filters: DEFAULT_SKILL_MARKET_FILTERS
            }
        const featured = await this.resolveFeaturedSkills(localeConfig.featured)

        return {
            featured,
            filters: localeConfig.filters
        }
    }

    async invalidateSkillTemplateCaches() {
        const deletableCache = this.cacheManager as Cache & {
            del?: (key: string) => Promise<void>
        }
        if (typeof deletableCache.del !== 'function') {
            return
        }

        await Promise.all([
            deletableCache.del('xpert:skills-market'),
            deletableCache.del('xpert:skill-repositories'),
            deletableCache.del('xpert:workspace-defaults'),
            deletableCache.del('xpert:template-skill-bundles')
        ])
    }

    async calculateSkillAssetFingerprint() {
        const hash = createHash('sha256')
        for (const fileName of ['skills-market.yaml', 'skill-repositories.yaml', 'workspace-defaults.yaml'] as const) {
            const filePath = await this.getExternalTemplatePath(fileName)
            hash.update(fileName)
            hash.update(await this.readTextFromFile(filePath, `template asset '${fileName}'`))
        }

        await appendDirectoryFingerprint(hash, await this.getExternalTemplatePath('skill-packages'), 'skill-packages')

        return hash.digest('hex')
    }

    async readSkillsMarketCatalog(): Promise<TLocalizedSkillMarketCatalog> {
        let config = await this.cacheManager.get<TLocalizedSkillMarketCatalog>('xpert:skills-market')
        if (config) {
            return config
        }

        const filePath = await this.getExternalTemplatePath('skills-market.yaml')
        const raw = await this.readYamlFromFile(filePath, 'skills market config')
        config = normalizeSkillMarketCatalog(raw)
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
        config = normalizeSkillRepositories(raw)
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
        config = normalizeWorkspaceDefaults(raw)
        await this.cacheManager.set('xpert:workspace-defaults', config, 10 * 1000)

        return config
    }

    async getBootstrapDefaultSkillRefs(): Promise<TWorkspaceDefaultSkillRef[]> {
        const config = await this.readWorkspaceDefaults()
        return config.userDefault.skills
    }

    async getSkillsMarketFeaturedRefs() {
        return Array.from((await this.getSkillsMarketFeaturedRefsByKey()).values())
    }

    async getUserDefaultSkillRefs(): Promise<TWorkspaceDefaultSkillRef[]> {
        const skillRefs = await this.getBootstrapDefaultSkillRefs()
        if (!skillRefs.length) {
            return []
        }

        const featuredRefsByKey = await this.getSkillsMarketFeaturedRefsByKey()
        const matchedRefs: TWorkspaceDefaultSkillRef[] = []
        const missingRefs: TWorkspaceDefaultSkillRef[] = []

        for (const ref of skillRefs) {
            const key = getSkillRefKey(ref)
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
                    .map((ref) => getSkillRefKey(ref))
                    .join(', ')}`
            )
        }

        return matchedRefs
    }

    private async getPluginTemplates(
        language: LanguagesEnum,
        query?: TXpertTemplateQuery
    ): Promise<TXpertTemplateDescriptor[]> {
        const plugins = this.getEffectivePluginRecords()
        const templates = await Promise.all(
            plugins.map(async (plugin) => {
                try {
                    return await this.readPluginTemplates(plugin, language, query)
                } catch (error) {
                    this.#logger.warn(
                        `Skipping xpert templates from plugin '${plugin.name}': ${getErrorMessage(error)}`
                    )
                    return []
                }
            })
        )

        return templates.flat()
    }

    private async getPluginTemplateById(
        id: string,
        language: LanguagesEnum,
        query?: TXpertTemplateQuery
    ): Promise<TXpertTemplateDescriptor | null> {
        const templates = await this.getPluginTemplates(language, query)
        const template = findPluginTemplateById(templates, id)
        if (!template) return null
        const plugin = this.getEffectivePluginRecords().find(
            (record) => normalizePluginPackageName(record.packageName ?? record.name) === template.pluginName
        )
        const source = plugin?.instance?.templates
        if (!plugin || !isTemplateCatalogProvider(source)) return template
        const key = template.id.slice(template.pluginName.length + 1)
        const contribution = await source.resolveTemplate(
            plugin.ctx,
            key,
            query?.locale ?? template.defaultLocale ?? language
        )
        if (contribution.key !== key) throw new Error('Resolved template key does not match its catalog entry')
        return this.toPluginTemplateDescriptor(plugin, contribution, language)
    }

    /** Selects the newest plugin record visible in the current request scope. */
    private getEffectivePluginRecords() {
        const organizationId = RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
        const tenantId = RequestContext.getScope()?.tenantId ?? RequestContext.currentTenantId()
        const organizationScopeKey =
            organizationId === GLOBAL_ORGANIZATION_SCOPE ? resolveTenantGlobalScopeKey(tenantId) : organizationId
        const globalScopeKey = resolveTenantGlobalScopeKey(tenantId)
        const seen = new Set<string>()
        const records = [...(this.loadedPlugins ?? [])]
            .filter(
                (plugin) =>
                    (plugin.scopeKey ?? plugin.organizationId) === organizationScopeKey ||
                    (organizationId !== GLOBAL_ORGANIZATION_SCOPE &&
                        (plugin.scopeKey ?? plugin.organizationId) === globalScopeKey) ||
                    (plugin.scopeKey ?? plugin.organizationId) === SYSTEM_GLOBAL_SCOPE
            )
            .reverse()
            .filter((plugin) => {
                const key = normalizePluginPackageName(
                    plugin.packageName ?? plugin.name ?? plugin.instance?.meta?.name ?? ''
                )
                if (!key || seen.has(key)) {
                    return false
                }
                seen.add(key)
                return true
            })

        return records.reverse()
    }

    private async readPluginTemplates(
        plugin: LoadedPluginRecord,
        language: LanguagesEnum,
        query?: TXpertTemplateQuery
    ): Promise<TXpertTemplateDescriptor[]> {
        const source = plugin.instance?.templates
        if (!source) {
            return []
        }

        const contributions = Array.isArray(source)
            ? source
            : typeof source.listTemplates === 'function'
              ? await source.listTemplates(plugin.ctx)
              : []

        return (contributions ?? [])
            .map((contribution) =>
                this.toPluginTemplateDescriptor(plugin, contribution, language, isTemplateCatalogProvider(source))
            )
            .filter((template): template is TXpertTemplateDescriptor => !!template)
            .filter((template) => matchesTemplateQuery(template, query))
    }

    private toPluginTemplateDescriptor(
        plugin: LoadedPluginRecord,
        contribution: XpertTemplateContribution,
        language: LanguagesEnum,
        summaryOnly = false
    ): TXpertTemplateDescriptor {
        return describePluginTemplate(
            plugin,
            contribution,
            language,
            summaryOnly,
            resolveTemplateApplication(plugin, contribution.key?.trim() || contribution.id?.trim())
        )
    }

    private async withTemplateExportData(id: string, descriptor: TXpertTemplateDescriptor) {
        if (typeof descriptor.export_data === 'string') {
            return descriptor
        }

        const templateFilePath = await this.getExternalTemplatePath('templates', `${id}.yaml`)
        return {
            ...descriptor,
            export_data: await this.readTextFromFile(templateFilePath, `template '${id}'`)
        }
    }

    private async upsertExportedXpertTemplateCatalog(templateId: string, xpert: TExportXpertTemplateInput['xpert']) {
        const templatesData = await this.readTemplatesFile()
        const descriptor = createExportedXpertTemplateDescriptor(templateId, xpert)
        const languages = Object.keys(templatesData.templates ?? {})

        if (!languages.length) {
            templatesData.templates = {
                [fallbackLanguage]: {
                    categories: [exportedXpertTemplateCategory],
                    recommendedApps: []
                }
            }
            languages.push(fallbackLanguage)
        }

        for (const language of languages) {
            const group = templatesData.templates[language] ?? { recommendedApps: [] }
            templatesData.templates[language] = {
                ...group,
                categories: mergeTemplateCategory(group.categories, exportedXpertTemplateCategory),
                recommendedApps: [descriptor, ...(group.recommendedApps ?? []).filter((item) => item.id !== templateId)]
            }
        }

        templatesData.details = templatesData.details ?? {}
        templatesData.details[templateId] = descriptor
        await this.writeTemplatesFile(templatesData)
    }

    private async removeExportedXpertTemplateCatalog(templateId: string) {
        const templatesData = await this.readTemplatesFile()

        for (const language of Object.keys(templatesData.templates ?? {})) {
            const group = templatesData.templates[language]
            if (!group) {
                continue
            }

            templatesData.templates[language] = {
                ...group,
                recommendedApps: (group.recommendedApps ?? []).filter((item) => item.id !== templateId)
            }
        }

        if (templatesData.details) {
            delete templatesData.details[templateId]
        }

        await this.writeTemplatesFile(templatesData)
    }

    private async resolveExternalRelativePath(relativePath: string) {
        const normalizedPath = path.normalize(relativePath)
        if (path.isAbsolute(normalizedPath) || normalizedPath === '..' || normalizedPath.startsWith(`..${path.sep}`)) {
            throw new Error(`Invalid xpert template path '${relativePath}'`)
        }

        return path.join(await this.commands.execute(new EnsureTemplateDirectoryCommand()), normalizedPath)
    }

    private async writeTemplatesFile(value: TXpertTemplatesCatalog) {
        const templatesFilePath = await this.getExternalTemplatePath('templates.json')
        try {
            await fs.promises.writeFile(templatesFilePath, JSON.stringify(value, null, 4), 'utf8')
        } catch (error) {
            throw new Error(
                `Failed to write xpert template file '${templatesFilePath}' (xpert template dir: '${getTemplateRoots(this.configService).externalRoot}'): ${getErrorMessage(error)}`
            )
        }
    }

    private async getExternalTemplatePath(...segments: string[]) {
        const templateRoot = await this.commands.execute(new EnsureTemplateDirectoryCommand())
        return path.join(templateRoot, ...segments)
    }

    private async resolveFeaturedSkills(featuredRefs: ISkillMarketFeaturedRef[]): Promise<ISkillMarketFeaturedSkill[]> {
        if (!featuredRefs.length) {
            return []
        }

        const resolved = await this.commands.execute(
            new ResolveTemplateSkillRefsCommand(
                featuredRefs.map((ref) => ({
                    provider: ref.provider,
                    repositoryName: ref.repositoryName,
                    skillId: ref.skillId
                }))
            )
        )
        const resolvedByKey = new Map(resolved.map(({ ref, skill }) => [getSkillRefKey(ref), skill]))
        const featured: ISkillMarketFeaturedSkill[] = []
        for (const ref of featuredRefs) {
            const skill = resolvedByKey.get(getSkillRefKey(ref))
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
        return getTemplateSkillBundles(
            await this.commands.execute(new EnsureTemplateDirectoryCommand()),
            this.cacheManager
        )
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
                const key = getSkillRefKey(normalizedRef)
                if (!refs.has(key)) {
                    refs.set(key, normalizedRef)
                }
            }
        }

        return refs
    }

    private async readJsonFromFile<T>(filePath: string) {
        try {
            const data = await fs.promises.readFile(filePath, 'utf8')
            return JSON.parse(data) as T
        } catch (error) {
            this.#logger.error(
                `Failed to read xpert template file '${filePath}'`,
                error instanceof Error ? error.stack : undefined
            )
            throw new Error(
                `Failed to read xpert template file '${filePath}' (xpert template dir: '${getTemplateRoots(this.configService).externalRoot}'): ${getErrorMessage(error)}`
            )
        }
    }

    private async readYamlFromFile(filePath: string, description: string) {
        try {
            const data = await fs.promises.readFile(filePath, 'utf8')
            return yaml.parse(data)
        } catch (error) {
            throw new Error(
                `Failed to read ${description} at '${filePath}' (xpert template dir: '${getTemplateRoots(this.configService).externalRoot}'): ${getErrorMessage(error)}`
            )
        }
    }

    private async readTextFromFile(filePath: string, description: string) {
        try {
            return await fs.promises.readFile(filePath, 'utf8')
        } catch (error) {
            throw new Error(
                `Failed to read ${description} at '${filePath}' (xpert template dir: '${getTemplateRoots(this.configService).externalRoot}'): ${getErrorMessage(error)}`
            )
        }
    }
}
