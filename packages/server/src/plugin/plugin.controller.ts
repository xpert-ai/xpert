import { Controller, Get, Inject } from '@nestjs/common'
import { LOADED_PLUGINS } from './types';

@Controller('plugin')
export class PluginController {
	@Inject(LOADED_PLUGINS)
	private readonly loadedPlugins: Array<{ name: string; instance: any; ctx: any }>

	@Get()
	getPlugins() {
		return this.loadedPlugins.map((plugin) => ({
			name: plugin.name,
			meta: plugin.instance.meta
		}))
	}
}
