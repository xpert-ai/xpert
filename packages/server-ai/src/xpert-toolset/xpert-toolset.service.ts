import { PaginationParams, RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger, NotFoundException, Type, Inject } from '@nestjs/common'
import { CommandBus, ICommand, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { FindConditions, IsNull, Not, Repository } from 'typeorm'
import { XpertToolset } from './xpert-toolset.entity'
import { ITag, IUser, IXpertToolset, TagCategoryEnum, XpertToolsetCategoryEnum } from '@metad/contracts'
import { assign } from 'lodash'
import { GetXpertWorkspaceQuery } from '../xpert-workspace'
import { DEFAULT_TOOL_TAG_MAP, defaultToolTags } from './utils/tags'
import { ListBuiltinToolProvidersQuery } from './queries'
import { ToolProviderNotFoundError } from './errors'
import { TToolsetProviderSchema } from './types'
import { ToolProviderDTO } from './dto'
import { ConfigService } from '@metad/server-config'
import { I18nService, translateOptions } from 'nestjs-i18n';
import { BuiltinToolset, createBuiltinToolset } from './provider/builtin'

@Injectable()
export class XpertToolsetService extends TenantOrganizationAwareCrudService<XpertToolset> {
	readonly #logger = new Logger(XpertToolsetService.name)

	@Inject(ConfigService)
	private readonly configService: ConfigService

	private commands = new Map<string, Type<ICommand>>()
	
	constructor(
		@InjectRepository(XpertToolset)
		repository: Repository<XpertToolset>,
		private readonly i18n: I18nService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(repository)
	}

	registerCommand(name: string, command: Type<ICommand>) {
		this.commands.set(name, command)
	}

	async executeCommand(name: string, ...args: any[]) {
		const command = this.commands.get(name)
		if (!command) {
			throw new Error(`Command "${name}" not found`)
		}
		return await this.commandBus.execute(new command(...args))
	}
	
	async update(id: string, entity: Partial<XpertToolset>) {
		const _entity = await super.findOne(id)
		assign(_entity, entity)
		return await this.repository.save(_entity)
	}
	
	async getAllByWorkspace(workspaceId: string, data: Partial<PaginationParams<XpertToolset>>, published: boolean, user: IUser) {
		const { relations, order, take } = data ?? {}
		let { where } = data ?? {}
		where = where ?? {}
		if (workspaceId === 'null' || workspaceId === 'undefined' || !workspaceId) {
			where = {
				...(<FindConditions<XpertToolset>>where),
				workspaceId: IsNull(),
				createdById: user.id
			}
		} else {
			const workspace = await this.queryBus.execute(new GetXpertWorkspaceQuery(user, { id: workspaceId }))
			if (!workspace) {
				throw new NotFoundException(`Not found or no auth for xpert workspace '${workspaceId}'`)
			}

			where = {
				...(<FindConditions<XpertToolset>>where),
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

	async createBuiltinToolset(
		provider: string,
		entity: Partial<IXpertToolset>
	) {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const providers = await this.queryBus.execute<ListBuiltinToolProvidersQuery, TToolsetProviderSchema[]>(new ListBuiltinToolProvidersQuery([provider]))
		if (!providers[0]) {
			throw new ToolProviderNotFoundError(`Builtin tool provider '${provider}' not found!`)
		}

		const toolproviderController: BuiltinToolset = createBuiltinToolset(provider, null, {
			tenantId,
			organizationId,
			toolsetService: this,
			commandBus: this.commandBus,
			queryBus: this.queryBus
		})
		// validate credentials
		await toolproviderController.validateCredentials(entity.credentials)
		// encrypt credentials
		// credentials = tool_configuration.encrypt_tool_credentials(credentials)

		if (entity.id) {
			return await this.update(entity.id, entity)
		}

		return await this.create({
			// Provider properties as the default fields
			name: providers[0].identity.name, 
			avatar: new ToolProviderDTO(providers[0].identity, this.configService.get('baseUrl') as string).avatar,
			// Custom fields
			...entity, 
			// Enforce constraints fields
			category: XpertToolsetCategoryEnum.BUILTIN,
			type: provider,
		})
	}

	/**
	 * Load the builtin provider tags for toolset
	 * @param toolsets 
	 * @returns 
	 */
	async afterLoad(toolsets: IXpertToolset[],) {
		const builtinNames = toolsets.filter((item) => item.category === XpertToolsetCategoryEnum.BUILTIN).map((item) => item.type)
		if (builtinNames.length) {
		//   const builtinTags = await this.getAllTags()
		  const providers = await this.queryBus.execute<ListBuiltinToolProvidersQuery, TToolsetProviderSchema[]>(new ListBuiltinToolProvidersQuery(builtinNames))
		  toolsets.filter((item) => item.category === XpertToolsetCategoryEnum.BUILTIN).forEach((toolset) => {
			const provider = providers.find((_) => _.identity.name === toolset.type)
			if (provider) {
				toolset.tags = provider.identity.tags?.map((name) => ({
					id: TagCategoryEnum.TOOLSET + '/' + name,
					category: TagCategoryEnum.TOOLSET,
					name,
					label: DEFAULT_TOOL_TAG_MAP[name]?.label,
					icon: DEFAULT_TOOL_TAG_MAP[name]?.icon
				} as ITag))
			}
		  })
		}

		return toolsets
	}

	async translate(key: string, options: translateOptions) {
		return await this.i18n.t(key, options)
	}

	isPro() {
		return this.configService.get('pro')
	}
}
