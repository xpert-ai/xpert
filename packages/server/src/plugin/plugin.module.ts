import { ConfigModule, ConfigService, getConfig } from '@metad/server-config'
import { DynamicModule, Global, Inject, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ModuleRef, DiscoveryModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { GLOBAL_ORGANIZATION_SCOPE, PluginLifecycleMethods, STRATEGY_META_KEY, StrategyBus, ChatChannelRegistry } from '@xpert-ai/plugin-sdk'
import chalk from 'chalk'
import { PluginController } from './plugin.controller'
import { collectProvidersWithMetadata, getPluginModules, hasLifecycleMethod, loaded, registerPluginsAsync } from './plugin.helper'
import { BUILTIN_XPERT_PLUGINS, LOADED_PLUGINS, LoadedPluginRecord } from './types'
import { attachPluginContext, resolvePluginAccessPolicy } from './lifecycle'
import { PluginInstance } from './plugin-instance.entity'
import { PluginInstanceService } from './plugin-instance.service'


@Global()
@Module({
	imports: [ConfigModule, CqrsModule, DiscoveryModule, TypeOrmModule.forFeature([PluginInstance])],
	controllers: [PluginController],
	exports: [StrategyBus, ChatChannelRegistry],
	providers: [{ provide: LOADED_PLUGINS, useValue: loaded }, PluginInstanceService, StrategyBus, ChatChannelRegistry]
})
export class PluginModule implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(PluginModule.name)
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
	 * Initialize the plugin module with built-in XpertPlugins asynchronously.
	 *
	 * @param builtinPlugins - List of built-in plugin package names to load (e.g., ['@xpert-ai/plugin-integration-lark'])
	 * @returns DynamicModule
	 */
	static async initAsync(builtinPlugins: string[] = []): Promise<DynamicModule> {
		const config = getConfig()

		// Register built-in XpertPlugins
		const { modules } = await registerPluginsAsync({
			organizationId: GLOBAL_ORGANIZATION_SCOPE,
			plugins: builtinPlugins.map(name => ({ name, source: 'code' })),
			baseDir: getConfig().assetOptions.serverRoot
		})

		return {
			module: PluginModule,
			imports: [...config.plugins, ...modules],
			providers: [
				{ provide: BUILTIN_XPERT_PLUGINS, useValue: builtinPlugins }
			]
		}
	}

	constructor(
		@Inject() private readonly moduleRef: ModuleRef,
		@Inject() private readonly configService: ConfigService,
		@Inject(LOADED_PLUGINS) private readonly loadedPlugins: Array<LoadedPluginRecord>,
		@Inject(StrategyBus) private readonly strategyBus: StrategyBus
	) {}

	/**
	 * Lifecycle hook called once the module has been initialized.
	 */
	async onModuleInit() {
		await this.bootstrapPluginLifecycleMethods('onPluginBootstrap', (instance: Function) => {
			const pluginName = instance.constructor.name || '(anonymous plugin)'
			console.log(chalk.white(`Bootstrapped Plugin [${pluginName}]`))
		})

		this.bindLoadedPluginContexts()
		await this.emitBuiltinPluginStrategies()
		await this.bootstrapXpertPluginLifecycle('onInit')
		await this.bootstrapXpertPluginLifecycle('onStart')
	}

	/**
	 * Lifecycle hook called once the module is about to be destroyed.
	 */
	async onModuleDestroy() {
		await this.bootstrapXpertPluginLifecycle('onStop')
		await this.bootstrapPluginLifecycleMethods('onPluginDestroy', (instance: Function) => {
			const pluginName = instance.constructor.name || '(anonymous plugin)'
			console.log(chalk.white(`Destroyed Plugin [${pluginName}]`))
		})
	}

	private bindLoadedPluginContexts() {
		for (const record of this.loadedPlugins) {
			const { allowed, allowResolve, allowAppContext } = resolvePluginAccessPolicy(record.instance, record.source)
			attachPluginContext(record.ctx, this.moduleRef as any, {
				allowed,
				allowResolve,
				allowAppContext,
				pluginName: record.name
			})
		}
	}

	/**
	 * Emit strategies from built-in plugins to the StrategyBus.
	 * This ensures that strategies registered via @AgentMiddlewareStrategy, @ToolsetStrategy, etc.
	 * are visible to the registry even when the plugin module is loaded at bootstrap time.
	 */
	private async emitBuiltinPluginStrategies() {
		for (const record of this.loadedPlugins) {
			let strategyProviders = collectProvidersWithMetadata(
				this.moduleRef,
				record.organizationId,
				record.name,
				this.logger
			)
			if (!strategyProviders.length && record.packageName && record.packageName !== record.name) {
				strategyProviders = collectProvidersWithMetadata(
					this.moduleRef,
					record.organizationId,
					record.packageName,
					this.logger
				)
			}
			for (const instance of strategyProviders) {
				const target = instance.metatype ?? instance.constructor
				const strategyMeta = Reflect.getMetadata(STRATEGY_META_KEY, target)
				if (strategyMeta) {
					this.logger.debug(
						`Emitting strategy ${strategyMeta} for built-in plugin ${record.name} in organization ${record.organizationId}`
					)
					this.strategyBus.upsert(strategyMeta, {
						instance,
						sourceId: `${record.organizationId}:${record.packageName}:${target.name}`,
						sourceKind: 'plugin'
					})
				}
			}
		}
	}

	private async bootstrapXpertPluginLifecycle(lifecycleMethod: 'onInit' | 'onStart' | 'onStop') {
		for await (const record of this.loadedPlugins) {
			const instance = record.instance
			if (instance && typeof instance[lifecycleMethod] === 'function') {
				await instance[lifecycleMethod](record.ctx)
			}
		}
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
