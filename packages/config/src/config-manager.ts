import { deepMerge, IPluginConfig } from '@xpert-ai/server-common';
import { defaultConfiguration } from './default-configuration';

let defaultConfig: IPluginConfig = defaultConfiguration;

/**
 * Override the default config by merging in the provided values.
 *
 * @param providedConfig - The provided configuration to merge with the default configuration.
 */
export function setConfig(providedConfig: Partial<IPluginConfig>): void {
	defaultConfig = deepMerge(defaultConfig, providedConfig);
	// A product version is one immutable snapshot, never a recursive merge of two definitions.
	if (Object.prototype.hasOwnProperty.call(providedConfig, 'appPlatform')) {
		defaultConfig.appPlatform = providedConfig.appPlatform;
	}
}

/**
 * Returns the app bootstrap config object.
 *
 * @returns The readonly default configuration.
 */
export function getConfig(): Readonly<IPluginConfig> {
	return defaultConfig;
}

/**
 * Reset the configuration to the default values.
 */
export function resetConfig(): void {
	defaultConfig = defaultConfiguration;
}
