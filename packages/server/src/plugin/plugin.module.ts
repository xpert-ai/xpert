import { DynamicModule, Inject, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ConfigModule, ConfigService, getConfig } from '@metad/server-config';
import chalk from 'chalk';
import { PluginLifecycleMethods, XpertPlugin } from '@xpert-ai/plugin-sdk';
import { getPluginModules, hasLifecycleMethod } from './plugin.helper';
import { discoverPlugins } from './plugin-discovery';
import { loadPlugin } from './plugin-loader';
import { buildConfig } from './config';
import { createPluginContext } from './lifecycle';
import { PluginController } from './plugin.controller';
import { LOADED_PLUGINS } from './types';


const loaded: {name: string; instance: XpertPlugin; ctx: any}[] = [];

@Module({
	imports: [ConfigModule],
	controllers: [PluginController],
	exports: [],
	providers: [
		{ provide: LOADED_PLUGINS, useValue: loaded }
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
		const config = getConfig();

		return {
			module: PluginModule,
			imports: [...config.plugins]
		};
	}

	constructor(
		@Inject() private readonly moduleRef: ModuleRef,
		@Inject() private readonly configService: ConfigService
	) { }

	/**
	 * Lifecycle hook called once the module has been initialized.
	 */
	async onModuleInit() {
		await this.bootstrapPluginLifecycleMethods('onPluginBootstrap', (instance: Function) => {
			const pluginName = instance.constructor.name || '(anonymous plugin)';
			console.log(chalk.white(`Bootstrapped Plugin [${pluginName}]`));
		});
	}

	/**
	 * Lifecycle hook called once the module is about to be destroyed.
	 */
	async onModuleDestroy() {
		await this.bootstrapPluginLifecycleMethods('onPluginDestroy', (instance: Function) => {
			const pluginName = instance.constructor.name || '(anonymous plugin)';
			console.log(chalk.white(`Destroyed Plugin [${pluginName}]`));
		});
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
		const pluginsModules = getPluginModules(this.configService.plugins);

		// Loop through each plugin module asynchronously
		for await (const pluginModule of pluginsModules) {
			let pluginInstance: ClassDecorator;

			try {
				// Attempt to retrieve an instance of the current plugin module
				pluginInstance = this.moduleRef.get(pluginModule, { strict: false });
			} catch (e) {
				console.error(`Error initializing plugin ${pluginModule.name}:`, e.stack);
			}

			// If the plugin instance exists and it implements the specified lifecycle method, call it
			if (pluginInstance && hasLifecycleMethod(pluginInstance, lifecycleMethod)) {
				await pluginInstance[lifecycleMethod]();

				// Execute the closure function if provided
				if (typeof closure === 'function') {
					closure(pluginInstance);
				}
			}
		}
	}
}
export interface XpertPluginModuleOptions {
	/** Explicit list of plugin package names (takes precedence) */
	plugins?: string[];
	/** Auto-discovery options (effective when plugins are not explicitly provided) */
	discovery?: { prefix?: string; manifestPath?: string };
	/** Configuration map injected by the main app (indexed by plugin name) */
	configs?: Record<string, unknown>;
}

export async function registerPluginsAsync(opts: XpertPluginModuleOptions = {}) {
	// Note: Nest's registerAsync usually returns a synchronous object. Here we provide a factory function for the caller to await first.
	const pluginNames = opts.plugins?.length ? opts.plugins : discoverPlugins(process.cwd(), opts.discovery);

	const modules: DynamicModule[] = [];

	for (const name of pluginNames) {
		const plugin = await loadPlugin(name);
		const cfgRaw = opts.configs?.[plugin.meta.name] ?? {};
		const cfg = buildConfig(plugin.meta.name, cfgRaw, plugin.config);
		// Construct a temporary ctx as a placeholder; the actual app instance will be completed after the app goes online
		const ctx = createPluginContext<any>({} as any, plugin.meta.name, cfg);
		const mod = plugin.register(ctx);
		modules.push(mod);
		loaded.push({ name: plugin.meta.name, instance: plugin, ctx });
	}

	return {
		modules,
	};
}
