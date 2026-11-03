import { AIPermissionsEnum, PermissionsEnum } from '@xpert-ai/contracts'
import { Permissions } from './../../shared/decorators/permissions'
import { TenantScopeGuard } from '../../shared/guards/tenant-scope.guard'
import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	Header,
	NotFoundException,
	Param,
	Post,
	Put,
	Query,
	StreamableFile,
	UseGuards
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { PluginMarketplaceRegistryItemInput, PluginMarketplaceSourceInput } from '@xpert-ai/contracts'
import { PluginMarketplaceService } from './plugin-marketplace.service'

@ApiTags('Plugin')
@Controller('plugin/marketplace')
@UseGuards(TenantScopeGuard)
@Permissions(PermissionsEnum.SUPER_ADMIN_EDIT)
export class PluginMarketplaceController {
	constructor(private readonly pluginMarketplaceService: PluginMarketplaceService) {}

	@Get('assets/icon')
	@Permissions(AIPermissionsEnum.XPERT_EDIT, PermissionsEnum.SUPER_ADMIN_EDIT)
	@Header('Cache-Control', 'private, max-age=86400, immutable')
	@Header('Vary', 'Authorization, tenant-id, organization-id, x-scope-level')
	@Header('X-Content-Type-Options', 'nosniff')
	async icon(
		@Query('name') name: string,
		@Query('hash') hash: string,
		@Query('sourceId') sourceId?: string,
		@Query('targetApp') targetApp?: string
	) {
		if (!name?.trim() || !/^[a-f0-9]{64}$/.test(hash ?? '')) {
			throw new BadRequestException()
		}
		const asset = await this.pluginMarketplaceService.getMarketplaceIconAsset(name, hash, { sourceId, targetApp })
		if (!asset || asset.hash !== hash) {
			throw new NotFoundException()
		}
		return new StreamableFile(asset.data, { type: asset.type, length: asset.data.length })
	}

	@Get()
	@Permissions(AIPermissionsEnum.XPERT_EDIT, PermissionsEnum.SUPER_ADMIN_EDIT)
	async getMarketplace(
		@Query('targetApp') targetApp?: string,
		@Query('sourceId') sourceId?: string,
		@Query('search') search?: string,
		@Query('view') view?: string
	) {
		return this.pluginMarketplaceService.listMarketplace({
			targetApp,
			sourceId,
			search,
			...(view === 'summary' ? { view } : {})
		})
	}

	@Get('sources')
	@Permissions(AIPermissionsEnum.XPERT_EDIT, PermissionsEnum.SUPER_ADMIN_EDIT)
	async getMarketplaceSources() {
		return this.pluginMarketplaceService.listSources()
	}

	@Post('sources')
	async createMarketplaceSource(@Body() body: PluginMarketplaceSourceInput) {
		return this.pluginMarketplaceService.createSource(body)
	}

	@Post('sources/refresh')
	async refreshMarketplaceSources() {
		return this.pluginMarketplaceService.refreshSources()
	}

	@Put('sources/:id')
	async updateMarketplaceSource(@Param('id') id: string, @Body() body: PluginMarketplaceSourceInput) {
		return this.pluginMarketplaceService.updateSource(id, body)
	}

	@Delete('sources/:id')
	async deleteMarketplaceSource(@Param('id') id: string) {
		return this.pluginMarketplaceService.deleteSource(id)
	}

	@Post('sources/:id/refresh')
	async refreshMarketplaceSource(@Param('id') id: string) {
		return this.pluginMarketplaceService.refreshSource(id)
	}

	@Get('registry')
	async getMarketplaceRegistryItems() {
		return this.pluginMarketplaceService.registry.listRegistryItems()
	}

	@Get('detail')
	@Permissions(AIPermissionsEnum.XPERT_EDIT, PermissionsEnum.SUPER_ADMIN_EDIT)
	async getMarketplacePluginDetail(
		@Query('name') name?: string,
		@Query('targetApp') targetApp?: string,
		@Query('sourceId') sourceId?: string,
		@Query('locale') locale?: string
	) {
		return this.pluginMarketplaceService.getMarketplacePluginDetail(name ?? '', {
			targetApp,
			sourceId,
			locale
		})
	}

	@Post('registry')
	async createMarketplaceRegistryItem(@Body() body: PluginMarketplaceRegistryItemInput) {
		return this.pluginMarketplaceService.registry.createRegistryItem(body)
	}

	@Put('registry/:id')
	async updateMarketplaceRegistryItem(@Param('id') id: string, @Body() body: PluginMarketplaceRegistryItemInput) {
		return this.pluginMarketplaceService.registry.updateRegistryItem(id, body)
	}

	@Delete('registry/:id')
	async deleteMarketplaceRegistryItem(@Param('id') id: string) {
		return this.pluginMarketplaceService.registry.deleteRegistryItem(id)
	}

	@Get(':name')
	@Permissions(AIPermissionsEnum.XPERT_EDIT, PermissionsEnum.SUPER_ADMIN_EDIT)
	async getMarketplacePlugin(
		@Param('name') name: string,
		@Query('targetApp') targetApp?: string,
		@Query('sourceId') sourceId?: string
	) {
		return this.pluginMarketplaceService.getMarketplacePluginContent(name, { targetApp, sourceId })
	}
}
