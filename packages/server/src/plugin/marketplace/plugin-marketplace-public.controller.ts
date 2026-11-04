import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Public } from '../../shared/decorators/public.decorator'
import { PluginMarketplaceService } from './plugin-marketplace.service'

@ApiTags('Plugin')
@Controller('plugin/marketplace/public')
@Public()
export class PluginMarketplacePublicController {
	constructor(private readonly pluginMarketplaceService: PluginMarketplaceService) {}

	@Get()
	async getPublicMarketplace(@Query('targetApp') targetApp?: string) {
		return this.pluginMarketplaceService.listPublicMarketplace({ targetApp })
	}
}
