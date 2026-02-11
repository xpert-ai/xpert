import { ConfigModule, ConfigService, getConfig, setConfig } from '@metad/server-config'
import { DynamicModule, Global, Inject, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
	INTEGRATION_PERMISSION_SERVICE_TOKEN,
	GLOBAL_ORGANIZATION_SCOPE,
	PluginLifecycleMethods,
	StrategyBus,
	USER_PERMISSION_SERVICE_TOKEN,
} from '@xpert-ai/plugin-sdk'
import chalk from 'chalk'
import { PluginController } from './plugin.controller'
import { getPluginModules, hasLifecycleMethod, loaded, registerPluginsAsync } from './plugin.helper'
import { LOADED_PLUGINS } from './types'
import { PluginInstance } from './plugin-instance.entity'
import { PluginInstanceService } from './plugin-instance.service'
import {
	PluginIntegrationPermissionService,
	PluginUserPermissionService,
} from './plugin-permission.service'


@Global()
@Module({
	imports: [ConfigModule, TypeOrmModule.forFeature([PluginInstance])],
	controllers: [PluginController],
	exports: [StrategyBus],
	providers: [
		{ provide: LOADED_PLUGINS, useValue: loaded },
		{ provide: INTEGRATION_PERMISSION_SERVICE_TOKEN, useExisting: PluginIntegrationPermissionService },
		{ provide: USER_PERMISSION_SERVICE_TOKEN, useExisting: PluginUserPermissionService },
		PluginInstanceService,
		PluginIntegrationPermissionService,
		PluginUserPermissionService,
		StrategyBus,
	]
})
export class PluginModule implements OnModuleInit, OnModuleDestroy {
	/**
	 * Configure the plugin module with the provided options. This method is called by the `PluginModule.init()` method.
	 *
	 * @returns An object representing the plugin module.
	 */
	static init(): DynamicModule {
		// Retrieve your config (and plugins) from wherever they're defined
		const config = getConfig()

		return {
			module: PluginModule,
			imports: [...config.plugins]
		}
	}

	/**
	 * Backward-compatible async initialization path used by legacy bootstrap code.
	 * It resolves built-in plugin package names into dynamic plugin modules, merges
	 * them into runtime config, and then delegates to `init()`.
	 */
	static async initAsync(builtinPlugins: string[] = []): Promise<DynamicModule> {
		if (!builtinPlugins.length) {
			return this.init()
		}

		const config = getConfig()
		const plugins = Array.isArray(config.plugins) ? config.plugins : []
		const { modules } = await registerPluginsAsync({
			organizationId: GLOBAL_ORGANIZATION_SCOPE,
			plugins: builtinPlugins.map((name) => ({ name, source: 'code' })),
			baseDir: config.assetOptions.serverRoot,
		})

		setConfig({
			plugins: [...plugins, ...modules],
		})

		return this.init()
	}

	constructor(
		@Inject() private readonly moduleRef: ModuleRef,
		@Inject() private readonly configService: ConfigService
	) {}

	/**
	 * Lifecycle hook called once the module has been initialized.
	 */
	async onModuleInit() {
		for (const item of loaded) {
			item.ctx.module = this.moduleRef
			item.ctx.app = this.moduleRef as any
		}

		await this.bootstrapPluginLifecycleMethods('onPluginBootstrap', (instance: Function) => {
			const pluginName = instance.constructor.name || '(anonymous plugin)'
			console.log(chalk.white(`Bootstrapped Plugin [${pluginName}]`))
		})
	}

	/**
	 * Lifecycle hook called once the module is about to be destroyed.
	 */
	async onModuleDestroy() {
		await this.bootstrapPluginLifecycleMethods('onPluginDestroy', (instance: Function) => {
			const pluginName = instance.constructor.name || '(anonymous plugin)'
			console.log(chalk.white(`Destroyed Plugin [${pluginName}]`))
		})
	}

	/**
	 * Invokes a specified lifecycle method on each plugin module, optionally
	 * running a closure function afterward.
	 *
	 * @private
	 * @async
	 * @param {keyof PluginLifecycleMethods} lifecycleMethod - The name of the lifecycle method to invoke on each plugin.
	 * @param {(instance: any) => void} [closure] - An optional callback executed after the lifecycle method finishes on each plugin.
	 * @returns {Promise<void>} A Promise that resolves once all plugins have been processed.
	 */
	private async bootstrapPluginLifecycleMethods(
		lifecycleMethod: keyof PluginLifecycleMethods,
		closure?: (instance: any) => void
	): Promise<void> {
		// Retrieve all plugin modules based on the configuration
		const pluginsModules = getPluginModules(this.configService.plugins)

		// Loop through each plugin module asynchronously
		for await (const pluginModule of pluginsModules) {
			let pluginInstance: ClassDecorator;

			try {
				// Attempt to retrieve an instance of the current plugin module
				pluginInstance = this.moduleRef.get(pluginModule, { strict: false })
			} catch (e) {
				console.error(`Error initializing plugin ${pluginModule.name}:`, e.stack)
			}

			// If the plugin instance exists and it implements the specified lifecycle method, call it
			if (pluginInstance && hasLifecycleMethod(pluginInstance, lifecycleMethod)) {
				await pluginInstance[lifecycleMethod]()

				// Execute the closure function if provided
				if (typeof closure === 'function') {
					closure(pluginInstance)
				}
			}
		}
	}
}
