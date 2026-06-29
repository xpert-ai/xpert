import { PaginationParams, RequestContext } from '@xpert-ai/server-core'
import { ConfigService } from '@xpert-ai/server-config'
import { Injectable, Logger, Type, Inject, NotFoundException } from '@nestjs/common'
import { CommandBus, ICommand, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOptionsWhere, IsNull, Not, Repository } from 'typeorm'
import { XpertToolset } from './xpert-toolset.entity'
import {
    IBuiltinTool,
    ITag,
    IUser,
    IXpertToolset,
    mapTranslationLanguage,
    TagCategoryEnum,
    TAvatar,
    XpertToolsetCategoryEnum
} from '@xpert-ai/contracts'
import { ToolsetRegistry } from '@xpert-ai/plugin-sdk'
import { assign } from 'lodash'
import { XpertWorkspaceAccessService, XpertWorkspaceBaseService } from '../xpert-workspace'
import { DEFAULT_TOOL_TAG_MAP, defaultToolTags } from './utils/tags'
import { ListBuiltinToolProvidersQuery, ListBuiltinToolsQuery } from './queries'
import { ToolProviderNotFoundError } from './errors'
import { TToolsetProviderSchema } from './types'
import { ToolProviderDTO } from './dto'
import { I18nService, TranslateOptions } from 'nestjs-i18n'
import { createBuiltinToolset } from './provider/builtin'
import { EnvStateQuery } from '../environment'
import { BuiltinToolset } from '../shared'

const DEFAULT_MCP_AVATAR: TAvatar = {
    url:
        'data:image/svg+xml;utf8,' +
        encodeURIComponent(
            `<svg width="180" height="180" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
<g clip-path="url(#clip0_19_13)">
<path d="M18 84.8528L85.8822 16.9706C95.2548 7.59798 110.451 7.59798 119.823 16.9706V16.9706C129.196 26.3431 129.196 41.5391 119.823 50.9117L68.5581 102.177" stroke="black" stroke-width="12" stroke-linecap="round"/>
<path d="M69.2652 101.47L119.823 50.9117C129.196 41.5391 144.392 41.5391 153.765 50.9117L154.118 51.2652C163.491 60.6378 163.491 75.8338 154.118 85.2063L92.7248 146.6C89.6006 149.724 89.6006 154.789 92.7248 157.913L105.331 170.52" stroke="black" stroke-width="12" stroke-linecap="round"/>
<path d="M102.853 33.9411L52.6482 84.1457C43.2756 93.5183 43.2756 108.714 52.6482 118.087V118.087C62.0208 127.459 77.2167 127.459 86.5893 118.087L136.794 67.8822" stroke="black" stroke-width="12" stroke-linecap="round"/>
</g>
<defs>
<clipPath id="clip0_19_13">
<rect width="180" height="180" fill="white"/>
</clipPath>
</defs>
</svg>`
        )
}

@Injectable()
export class XpertToolsetService extends XpertWorkspaceBaseService<XpertToolset> {
    readonly #logger = new Logger(XpertToolsetService.name)

    @Inject(ConfigService)
    private readonly configService: ConfigService

    @Inject(ToolsetRegistry)
    protected readonly toolsetRegistry: ToolsetRegistry

    /**
     * @deprecated
     */
    private commands = new Map<string, Type<ICommand>>()

    constructor(
        @InjectRepository(XpertToolset)
        repository: Repository<XpertToolset>,
        workspaceAccessService: XpertWorkspaceAccessService,
        private readonly i18n: I18nService,
        protected readonly commandBus: CommandBus,
        protected readonly queryBus: QueryBus
    ) {
        super(repository, workspaceAccessService)
    }

    /**
     * @deprecated
     */
    registerCommand(name: string, command: Type<ICommand>) {
        this.commands.set(name, command)
    }

    /**
     * @deprecated
     */
    async executeCommand(name: string, ...args: unknown[]) {
        const command = this.commands.get(name)
        if (!command) {
            throw new Error(`Command "${name}" not found`)
        }
        return await this.commandBus.execute(new command(...args))
    }

    async update(id: string, entity: Partial<XpertToolset>) {
        const _entity = await super.findOne(id)
        assign(_entity, entity)
        return await super.save(_entity)
    }

    async getAllByWorkspace(
        workspaceId: string,
        data: Partial<PaginationParams<XpertToolset>>,
        published: boolean,
        user: IUser
    ) {
        const { relations, order, take } = data ?? {}
        let { where } = data ?? {}
        where = where ?? {}
        if (workspaceId === 'null' || workspaceId === 'undefined' || !workspaceId) {
            where = {
                ...(<FindOptionsWhere<XpertToolset>>where),
                workspaceId: IsNull(),
                createdById: user.id
            }
        } else {
            await this.assertWorkspaceReadAccess(workspaceId)
            where = {
                ...(<FindOptionsWhere<XpertToolset>>where),
                workspaceId: workspaceId
            }
        }

        if (published) {
            where.publishAt = Not(IsNull())
        }

        return this.findAll({
            where,
            relations,
            order,
            take
        })
    }

    async getAllTags() {
        return defaultToolTags
    }

    async findPublicAvatar(id: string, tenantId: string) {
        const toolset = await this.repository.findOne({
            where: {
                id,
                tenantId
            },
            select: {
                id: true,
                avatar: true,
                category: true
            },
            loadEagerRelations: false
        })

        if (!toolset) {
            throw new NotFoundException(`The requested record was not found`)
        }

        if (hasAvatar(toolset.avatar)) {
            return toolset.avatar
        }

        return toolset.category === XpertToolsetCategoryEnum.MCP ? DEFAULT_MCP_AVATAR : toolset.avatar
    }

    async createBuiltinToolset(provider: string, entity: Partial<IXpertToolset>) {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const providers = await this.queryBus.execute<ListBuiltinToolProvidersQuery, TToolsetProviderSchema[]>(
            new ListBuiltinToolProvidersQuery([provider])
        )
        if (!providers[0]) {
            throw new ToolProviderNotFoundError(`Builtin tool provider '${provider}' not found!`)
        }

        const envState = await this.queryBus.execute(new EnvStateQuery(entity.workspaceId))
        const toolproviderController: BuiltinToolset = await createBuiltinToolset(provider, null, {
            tenantId,
            organizationId,
            // toolsetService: this,
            commandBus: this.commandBus,
            queryBus: this.queryBus,
            env: envState
        })
        // validate credentials
        if (toolproviderController.validateCredentials) {
            await toolproviderController.validateCredentials(entity.credentials)
        }
        // encrypt credentials
        // credentials = tool_configuration.encrypt_tool_credentials(credentials)

        if (entity.id) {
            return await this.update(entity.id, entity)
        }

        return await this.create({
            // Provider properties as the default fields
            name: providers[0].identity.name,
            avatar: new ToolProviderDTO(
                providers[0].identity,
                this.configService.get('baseUrl') as string,
                organizationId
            ).avatar,
            // Custom fields
            ...entity,
            // Enforce constraints fields
            category: XpertToolsetCategoryEnum.BUILTIN,
            type: provider
        })
    }

    /**
     * Load the builtin provider tags for toolset
     * @param toolsets
     * @returns
     */
    async afterLoad(toolsets: IXpertToolset[]) {
        const builtinNames = toolsets
            .filter((item) => item.category === XpertToolsetCategoryEnum.BUILTIN)
            .map((item) => item.type)
        if (builtinNames.length) {
            //   const builtinTags = await this.getAllTags()
            const providers = await this.queryBus.execute<ListBuiltinToolProvidersQuery, TToolsetProviderSchema[]>(
                new ListBuiltinToolProvidersQuery(builtinNames)
            )
            toolsets
                .filter((item) => item.category === XpertToolsetCategoryEnum.BUILTIN)
                .forEach((toolset) => {
                    const provider = providers.find((_) => _.identity.name === toolset.type)
                    if (provider) {
                        toolset.tags = provider.identity.tags?.map(
                            (name) =>
                                ({
                                    id: TagCategoryEnum.TOOLSET + '/' + name,
                                    category: TagCategoryEnum.TOOLSET,
                                    name,
                                    label: DEFAULT_TOOL_TAG_MAP[name]?.label,
                                    icon: DEFAULT_TOOL_TAG_MAP[name]?.icon
                                }) as ITag
                        )
                    }
                })
        }

        await this.hydrateBuiltinToolSchemas(toolsets)

        return toolsets
    }

    private async hydrateBuiltinToolSchemas(toolsets: IXpertToolset[]) {
        const builtinNames = Array.from(
            new Set(
                toolsets
                    .filter(
                        (item) =>
                            item.category === XpertToolsetCategoryEnum.BUILTIN &&
                            item.type &&
                            item.tools?.length
                    )
                    .map((item) => item.type)
            )
        )

        await Promise.all(
            builtinNames.map(async (provider) => {
                const builtinTools = await this.queryBus.execute<ListBuiltinToolsQuery, IBuiltinTool[]>(
                    new ListBuiltinToolsQuery(provider)
                )
                const latestTools = new Map(builtinTools.map((tool) => [tool.identity.name, tool]))

                toolsets
                    .filter(
                        (toolset) =>
                            toolset.category === XpertToolsetCategoryEnum.BUILTIN && toolset.type === provider
                    )
                    .forEach((toolset) => {
                        toolset.tools?.forEach((tool) => {
                            const latestTool = latestTools.get(tool.name)
                            if (latestTool) {
                                tool.label ??= latestTool.identity.label
                                tool.description ??=
                                    latestTool.description?.human?.zh_Hans ??
                                    latestTool.description?.human?.en_US ??
                                    latestTool.description?.llm
                                tool.schema = latestTool.schema
                            }
                        })
                    })
            })
        )
    }

    async translate(key: string, options?: TranslateOptions) {
        options ??= {}
        options.lang ??= mapTranslationLanguage(RequestContext.getLanguageCode())
        return await this.i18n.t(key, options)
    }

    isPro() {
        return this.configService.get('pro')
    }
}

function hasAvatar(avatar?: TAvatar | null) {
    return !!(avatar?.url || avatar?.emoji?.id)
}
