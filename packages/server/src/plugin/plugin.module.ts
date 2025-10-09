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
  /** 明确的插件包名列表（优先） */
  plugins?: string[];
  /** 自动发现选项（当未显式传入 plugins 时生效） */
  discovery?: { prefix?: string; manifestPath?: string };
  /** 主应用注入的配置表（按插件名索引） */
  configs?: Record<string, unknown>;
}

export async function registerPluginsAsync(opts: XpertPluginModuleOptions = {}) {
    // 注意：Nest 的 registerAsync 通常返回同步对象。这里提供一个工厂函数供上层调用时先 await。
    const pluginNames = opts.plugins?.length ? opts.plugins : discoverPlugins(process.cwd(), opts.discovery);

    const modules: DynamicModule[] = [];

    for (const name of pluginNames) {
      const plugin = await loadPlugin(name);
      const cfgRaw = opts.configs?.[plugin.meta.name] ?? {};
      const cfg = buildConfig(plugin.meta.name, cfgRaw, plugin.config);
      // 先构造一个临时 ctx，占位，真正 app 上线后再补全 app 实例
      const ctx = createPluginContext<any>({} as any, plugin.meta.name, cfg);
      const mod = plugin.register(ctx);
      modules.push(mod);
      loaded.push({ name: plugin.meta.name, instance: plugin, ctx });
    }

    return {
      modules,
    };
}