import { ConfigModule, ConfigService, getConfig } from '@metad/server-config'
import { DynamicModule, Global, Inject, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PluginLifecycleMethods, StrategyBus } from '@xpert-ai/plugin-sdk'
import chalk from 'chalk'
import { PluginController } from './plugin.controller'
import { getPluginModules, hasLifecycleMethod, loaded } from './plugin.helper'
import { LOADED_PLUGINS } from './types'
import { PluginInstance } from './plugin-instance.entity'
import { PluginInstanceService } from './plugin-instance.service'


@Global()
@Module({
	imports: [ConfigModule, TypeOrmModule.forFeature([PluginInstance])],
	controllers: [PluginController],
	exports: [StrategyBus],
	providers: [{ provide: LOADED_PLUGINS, useValue: loaded }, PluginInstanceService, StrategyBus]
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

	constructor(
		@Inject() private readonly moduleRef: ModuleRef,
		@Inject() private readonly configService: ConfigService
	) {}

	/**
	 * Lifecycle hook called once the module has been initialized.
	 */
	async onModuleInit() {
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
