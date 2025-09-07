/**
 * Metadata keys used in plugins for defining various aspects like entities, subscribers, and configurations.
 */
export const PLUGIN_METADATA = {
	/**
	 * Key representing the entities registered within the plugin.
	 */
	ENTITIES: 'entities',

	/**
	 * Key representing event subscribers within the plugin.
	 */
	SUBSCRIBERS: 'subscribers',

} as const;

/**
 * Type definition for valid plugin metadata keys.
 */
export type PluginMetadataKey = (typeof PLUGIN_METADATA)[keyof typeof PLUGIN_METADATA];
