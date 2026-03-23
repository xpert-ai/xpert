import { JsonSchemaObjectType } from '@metad/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import zodToJsonSchema from 'zod-to-json-schema'

function isObjectSchema(value: unknown): value is JsonSchemaObjectType {
	return !!value && typeof value === 'object' && (value as JsonSchemaObjectType).type === 'object'
}

export function resolvePluginConfigSchema(plugin: XpertPlugin): JsonSchemaObjectType | undefined {
	if (isObjectSchema(plugin?.config?.formSchema)) {
		return plugin.config.formSchema
	}

	if (!plugin?.config?.schema) {
		return undefined
	}

	const schema = zodToJsonSchema(plugin.config.schema, {
		target: 'jsonSchema7'
	})

	return isObjectSchema(schema) ? schema : undefined
}
