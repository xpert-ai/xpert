import { isNotEmpty } from '@metad/server-common';
import { getConfig } from '@metad/server-config';
import { DynamicModule, Type, Logger } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ModuleRef, NestContainer } from '@nestjs/core';
import { GLOBAL_ORGANIZATION_SCOPE, ORGANIZATION_METADATA_KEY, PLUGIN_METADATA, PLUGIN_METADATA_KEY, PluginLifecycleMethods } from '@xpert-ai/plugin-sdk';
import { getOrganizationManifestPath, getOrganizationPluginPath, getOrganizationPluginRoot, installOrganizationPlugins, OrganizationPluginStoreOptions } from './organization-plugin.store';
import { isClassProvider, isExistingProvider, isFactoryProvider, isValueProvider, LoadedPluginRecord, normalizePluginName } from './types';
import { discoverPlugins } from './plugin-discovery';
import { loadPlugin } from './plugin-loader';
import { buildConfig } from './config';
import { createPluginContext } from './lifecycle';

/**
 * Get plugin classes from an array of plugins by reflecting metadata.
 * @param plugins An array of plugins containing metadata.
 * @param metadataKey The metadata key to retrieve from plugins.
 * @returns An array of classes obtained from the provided plugins and metadata key.
 */
function getClassesFromPlugins(plugins: Array<Type<any> | DynamicModule>, metadataKey: string): Array<Type<any>> {
	if (!plugins) {
		return [];
	}

	return plugins.flatMap((plugin: Type<any> | DynamicModule) => reflectMetadata(plugin, metadataKey) ?? []);
}

/**
 * Get plugin entities classes from an array of plugins.
 * @param plugins An array of plugins containing entity metadata.
 * @returns An array of entity classes obtained from the provided plugins.
 */
export function getEntitiesFromPlugins(plugins?: Array<Type<any> | DynamicModule>): Array<Type<any>> {
	return getClassesFromPlugins(plugins, PLUGIN_METADATA.ENTITIES);
}

/**
 * Get subscribers from an array of plugins.
 * @param plugins An array of plugins containing subscriber metadata.
 * @returns An array of subscriber classes obtained from the provided plugins.
 */
export function getSubscribersFromPlugins(plugins?: Array<Type<any> | DynamicModule>): Array<Type<any>> {
	return getClassesFromPlugins(plugins, PLUGIN_METADATA.SUBSCRIBERS);
}

/**
 * Get plugin modules from an array of plugins.
 * @param plugins An array of plugins.
 * @returns An array of modules obtained from the provided plugins.
 */
export function getPluginModules(plugins: Array<Type<any> | DynamicModule>): Array<Type<any>> {
	return plugins.map((plugin: Type<any> | DynamicModule) => {
		if (isDynamicModule(plugin)) {
			const { module } = plugin;
			return module;
		}
		return plugin;
	});
}

/**
 * Reflect metadata for a given metatype and metadata key.
 * @param metatype The type or dynamic module to reflect metadata from.
 * @param metadataKey The key for the metadata to be reflected.
 * @returns The metadata associated with the given key.
 */
function reflectMetadata(metatype: Type<any> | DynamicModule, metadataKey: string) {
	// Extract the module property if the metatype is a DynamicModule
	const target = isDynamicModule(metatype) ? metatype.module : metatype;

	// Retrieve and return metadata for the specified key
	return Reflect.getMetadata(metadataKey, target);
}

/**
 * Checks if a plugin has a specific lifecycle method.
 * @param plugin The plugin instance to check.
 * @param lifecycleMethod The lifecycle method to check for.
 * @returns True if the plugin has the specified lifecycle method, false otherwise.
 */
export function hasLifecycleMethod<M extends keyof PluginLifecycleMethods>(
	plugin: any,
	lifecycleMethod: M
): plugin is { [key in M]: PluginLifecycleMethods[M] } {
	return typeof (plugin as any)[lifecycleMethod] === 'function';
}

/**
 * Checks if a given type is a DynamicModule.
 * @param type The type to check.
 * @returns True if the type is a DynamicModule, false otherwise.
 */
export function isDynamicModule(type: Type<any> | DynamicModule): type is DynamicModule {
	return !!(type as DynamicModule).module;
}

/**
 * Reflects metadata from a dynamic module, extracting information about controllers, providers,
 * imports, and exports.
 * @param module The dynamic module to reflect metadata from.
 * @returns An object containing metadata information about controllers, providers, imports, and exports.
 */
export function reflectDynamicModuleMetadata(module: Type<any>) {
	return {
		controllers: reflectMetadata(module, MODULE_METADATA.CONTROLLERS) || [],
		providers: reflectMetadata(module, MODULE_METADATA.PROVIDERS) || [],
		imports: reflectMetadata(module, MODULE_METADATA.IMPORTS) || [],
		exports: reflectMetadata(module, MODULE_METADATA.EXPORTS) || []
	};
}

/**
 * Retrieves dynamic plugin modules based on the configuration.
 * @returns An array of DynamicModule instances extracted from the configuration.
 */
export function getDynamicPluginsModules(): DynamicModule[] {
	const plugins = getConfig().plugins;

	return plugins
		.map((plugin: Type<any> | DynamicModule) => {
			const pluginModule = isDynamicModule(plugin) ? plugin.module : plugin;
			const { imports, providers, exports } = reflectDynamicModuleMetadata(pluginModule);
			return {
				module: pluginModule,
				imports,
				exports,
				providers: [...providers]
			};
		})
		.filter(isNotEmpty);
}

export const loaded: LoadedPluginRecord[] = []
/**
 * Collect providers from modules tagged with PLUGIN_METADATA_KEY/ORGANIZATION_METADATA_KEY.
 */
export function collectProvidersWithMetadata<TMeta = any>(
  moduleRef: ModuleRef,
  organizationId: string,
  pluginName: string,
  logger: Logger
) {

  logger.debug(`Collecting providers for plugin '${pluginName}' under organization '${organizationId}'`);
  const container = (moduleRef as unknown as { container?: NestContainer }).container;
  if (!container?.getModules) return [];

  const providers: any[] = [];
  const seen = new Set<any>();

  logger.debug(`Scanning modules in the NestJS container...`);
  for (const module of container.getModules().values()) {
	const target = module.metatype ?? module.constructor;
    const modPluginName = Reflect.getMetadata(PLUGIN_METADATA_KEY, target);
    const modOrganization = Reflect.getMetadata(ORGANIZATION_METADATA_KEY, target);

    if (modOrganization !== organizationId || modPluginName !== pluginName) {
      continue;
    }

	logger.debug(`Module matches organization ${modOrganization} and plugin ${modPluginName} criteria. Collecting providers...`);
    for (const wrapper of module.providers?.values?.() ?? []) {
      const instance = wrapper.instance;
      if (!instance || seen.has(instance)) continue;

	  logger.debug(`Collecting provider instance: ${instance.constructor.name}`);
	  
      providers.push(instance);
      seen.add(instance);
    }
  }

  return providers;
}


export interface XpertPluginModuleOptions extends OrganizationPluginStoreOptions {
	/** The organization scope for plugin discovery/loading. Defaults to 'global'. */
	organizationId?: string;
	/** Nest module context for resolving dependencies during registration. */
	module?: ModuleRef;
	/** Override the plugin workspace root for the organization. Defaults to data/plugins/<orgId> when organizationId is set. */
	baseDir?: string;
	/** Explicit list of plugin package names (takes precedence) */
	plugins?: {name: string; version?: string; source?: string}[];
	/** Auto-discovery options (effective when plugins are not explicitly provided) */
	discovery?: { prefix?: string; manifestPath?: string };
	/** Configuration map injected by the main app (indexed by plugin name) */
	configs?: Record<string, unknown>;
}

/**
 * Install and register plugins asynchronously for a given organization scope.
 * 1. Install plugins into the organization workspace.
 * 2. Load each plugin and build its configuration.
 * 3. Create a plugin context and register the plugin module.
 * 4. Tag the module and its providers with organization and plugin metadata.
 * 
 * @param opts 
 * @returns 
 */
export async function registerPluginsAsync(opts: XpertPluginModuleOptions = {}) {
	const organizationId = opts.organizationId ?? GLOBAL_ORGANIZATION_SCOPE;
	const baseDirRoot =
		opts.baseDir ?? (opts.organizationId ? getOrganizationPluginRoot(organizationId, opts) : process.cwd());

	const discoveryOptions = { ...opts.discovery };
	if (!discoveryOptions.manifestPath && opts.organizationId) {
		discoveryOptions.manifestPath = getOrganizationManifestPath(organizationId, opts);
	}

	const pluginNames = opts.plugins?.length
		? opts.plugins
		: opts.discovery || opts.organizationId
		? discoverPlugins(baseDirRoot, discoveryOptions)
		: [];

	// 1) install into organization workspace (and update manifest)
	installOrganizationPlugins(organizationId, pluginNames.filter(p => p.source !== 'code').map(p => p.name), opts);

	const modules: DynamicModule[] = [];

	for (const {name} of pluginNames) {
		const pluginBaseDir = opts.organizationId
			? getOrganizationPluginPath(organizationId, name, opts)
			: baseDirRoot;
		// 2) Load each plugin and build its configuration.
		const plugin = await loadPlugin(name, { basedir: pluginBaseDir });
		const cfgRaw = opts.configs?.[plugin.meta.name] ?? {};
		const cfg = buildConfig(plugin.meta.name, cfgRaw, plugin.config);

		// 3) Create a plugin context and register the plugin module.
		// Construct a temporary ctx as a placeholder; the actual app instance will be completed after the app goes online
		const ctx = createPluginContext<any>(opts.module, plugin.meta.name, cfg, plugin.permissions ?? []);
		const mod = plugin.register(ctx);

		// 4) Tag the module and its providers with organization and plugin metadata.
		tagModuleWithOrganization(mod, organizationId, normalizePluginName(name));
		modules.push(mod);
		const existing = loaded.findIndex(
			(item) => item.organizationId === organizationId && item.name === plugin.meta.name,
		);
		if (existing >= 0) {
			loaded.splice(existing, 1);
		}
		loaded.push({
			organizationId,
			name: plugin.meta.name,
			packageName: name,
			instance: plugin,
			ctx,
			baseDir: pluginBaseDir,
		});
	}

	return {
		organizationId,
		modules,
	};
}

function tagModuleWithOrganization(mod: DynamicModule, organizationId: string, pluginName: string) {
	const target = mod.module;
	Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, organizationId, target);
	Reflect.defineMetadata(PLUGIN_METADATA_KEY, pluginName, target);
	tagModuleProvidersWithOrganization(mod, organizationId, pluginName);
}

function tagModuleProvidersWithOrganization(plugin: DynamicModule, organizationId: string, pluginName: string) {
	const pluginModule = isDynamicModule(plugin) ? plugin.module : plugin;
	const { imports, providers, exports } = reflectDynamicModuleMetadata(pluginModule);
	for (const provider of providers) {
		const target =
			(typeof provider === 'function' && provider) ||
			(isClassProvider(provider) && provider.useClass) ||
			(isFactoryProvider(provider) && provider.useFactory) ||
			(isExistingProvider(provider) && provider.useExisting) ||
			(isValueProvider(provider) && provider.useValue);
		if (target) {
			Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, organizationId, target);
			Reflect.defineMetadata(PLUGIN_METADATA_KEY, pluginName, target);
		}
	}
}
