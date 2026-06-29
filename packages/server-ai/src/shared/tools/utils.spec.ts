import { z } from 'zod'
import { JsonSchema7Type } from 'zod-to-json-schema'
import { ToolSchemaParser } from './utils'

type JsonSchemaWithUi = JsonSchema7Type & {
	properties?: {
		size?: JsonSchema7Type & {
			'x-ui'?: {
				title?: {
					en_US: string
					zh_Hans: string
				}
			}
		}
	}
}

describe('ToolSchemaParser', () => {
	it('passes through plain JSON schema without converting it as Zod', () => {
		const schema: JsonSchemaWithUi = {
			type: 'object',
			properties: {
				size: {
					type: 'string',
					enum: ['2048x2048'],
					default: '2048x2048',
					'x-ui': {
						title: {
							en_US: 'Image size',
							zh_Hans: '图像尺寸'
						}
					}
				}
			}
		}

		expect(ToolSchemaParser.parseZodToJsonSchema(schema)).toEqual(schema)
	})

	it('still converts Zod schemas to JSON schema', () => {
		expect(ToolSchemaParser.parseZodToJsonSchema(z.object({ prompt: z.string() }))).toEqual(
			expect.objectContaining({
				type: 'object',
				properties: expect.objectContaining({
					prompt: expect.objectContaining({
						type: 'string'
					})
				})
			})
		)
	})
})
