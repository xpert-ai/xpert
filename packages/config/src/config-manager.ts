import { deepMerge, IPluginConfig } from '@metad/server-common';
import { defaultConfiguration } from './default-configuration';

let defaultConfig: IPluginConfig = defaultConfiguration;

/**
 * Override the default config by merging in the provided values.
 *
 * @param providedConfig - The provided configuration to merge with the default configuration.
 */
export function setConfig(providedConfig: Partial<IPluginConfig>): void {
	defaultConfig = deepMerge(defaultConfig, providedConfig);
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