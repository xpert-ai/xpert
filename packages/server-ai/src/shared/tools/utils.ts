import { zodToJsonSchema } from 'zod-to-json-schema'
import { z } from 'zod'
type ZodObjectAny = z.ZodObject<any, any, any, any>


export class ToolSchemaParser {
	static parseZodToJsonSchema(schema: ZodObjectAny | z.ZodEffects<ZodObjectAny>) {
		const jsonSchema = zodToJsonSchema(schema)
		return jsonSchema
	}

	static serializeJsonSchema(schema) {
		return JSON.stringify(schema, null, 2)
	}
}

export function toolNamePrefix(prefix: string, name: string) {
	return `${prefix ? prefix + '__' : ''}${name}`
}