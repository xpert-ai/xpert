import { ApiToolBundle, ApiProviderSchemaType, ToolParameterType } from '@metad/contracts'
import type { OperationObject, ParameterObject, RequestBody } from "openapi-typescript/src/types";
import * as fs from 'fs';
import * as path from 'path';
import { ApiBasedToolSchemaParser } from './parser'
import { ToolApiSchemaError } from '../errors'


describe('ApiBasedToolSchemaParser.autoParseToToolBundle', () => {
	const originalFetch = global.fetch

	afterEach(() => {
		jest.restoreAllMocks()
		;(global as any).fetch = originalFetch
	})

	it('parses OpenAPI json and returns the corresponding tool bundle', async () => {
		const openapi = {
			openapi: '3.0.0',
			info: { title: 'Test API', description: 'desc', version: '1.0.0' },
			servers: [{ url: 'https://api.example.com' }],
			paths: {
				'/users': {
					get: {
						operationId: 'getUsers',
						summary: 'List users',
						parameters: [
							{
								name: 'limit',
								in: 'query',
								required: false,
								description: 'Max results',
								schema: { type: 'integer', default: 10 }
							}
						],
						responses: { 200: { description: 'ok' } }
					}
				}
			}
		}

		const [bundles, schemaType] = await ApiBasedToolSchemaParser.autoParseToToolBundle(
			JSON.stringify(openapi)
		)

		expect(schemaType).toBe(ApiProviderSchemaType.OPENAPI)
		expect(bundles).toHaveLength(1)
		expect(bundles[0].server_url).toBe('https://api.example.com/users')
		expect(bundles[0].operation_id).toBe('getUsers')
		expect(bundles[0].parameters?.[0].type).toBe(ToolParameterType.NUMBER)
		expect(bundles[0].parameters?.[0].default).toBe(10)
	})

	it('falls back to swagger parsing when openapi parsing fails', async () => {
		const swagger = {
			swagger: '2.0',
			info: { title: 'Swagger API', version: '1.0.0' },
			host: 'api.example.com',
			basePath: '/v1',
			paths: {
				'/pets': {
					get: {
						operationId: 'listPets',
						summary: 'List pets',
						parameters: [{ name: 'limit', in: 'query', required: false, type: 'integer' }],
						responses: { 200: { description: 'ok' } }
					}
				}
			}
		}

		const [bundles, schemaType] = await ApiBasedToolSchemaParser.autoParseToToolBundle(
			JSON.stringify(swagger)
		)

		expect(schemaType).toBe(ApiProviderSchemaType.SWAGGER)
		expect(bundles).toHaveLength(1)
		expect(bundles[0].server_url).toBe('https://api.example.com/v1/pets')
		expect(bundles[0].operation_id).toBe('listPets')
	})

	it('parses openai plugin manifest by fetching the referenced openapi schema', async () => {
		const pluginManifest = {
			schema_version: 'v1',
			name_for_model: 'plugin',
			api: {
				type: 'openapi',
				url: 'https://example.com/openapi.yaml'
			}
		}
		const openapiYaml = `
openapi: 3.0.0
info:
  title: Plugin API
  version: 1.0.0
servers:
  - url: https://plugin.example.com
paths:
  /hello:
    get:
      operationId: sayHello
      summary: Say hello
      responses:
        '200':
          description: ok
`
		const mockFetch = jest.fn().mockResolvedValue({
			ok: true,
			text: async () => openapiYaml
		})
		;(global as any).fetch = mockFetch

		const [bundles, schemaType] = await ApiBasedToolSchemaParser.autoParseToToolBundle(
			JSON.stringify(pluginManifest)
		)

		expect(schemaType).toBe(ApiProviderSchemaType.OPENAI_PLUGIN)
		expect(mockFetch).toHaveBeenCalledTimes(1)
		expect(mockFetch).toHaveBeenCalledWith(
			'https://example.com/openapi.yaml',
			expect.objectContaining({ headers: expect.any(Object) })
		)
		expect(bundles[0].server_url).toBe('https://plugin.example.com/hello')
		expect(bundles[0].operation_id).toBe('sayHello')
	})

	it('throws ToolApiSchemaError when content cannot be parsed as a supported schema', async () => {
		await expect(ApiBasedToolSchemaParser.autoParseToToolBundle('{}')).rejects.toThrow(
			ToolApiSchemaError
		)
	})

	it('parses OpenAPI yaml containing $ref requestBody and array responses', async () => {
		const yamlSpec = `
openapi: 3.0.0
info:
  title: 物料信息查询服务
  version: 1.0.0
servers:
  - url: http://127.0.0.1:7001/BIService/Open/ChangeControl
paths:
  /GetMaterialTriInitialInfo:
    post:
      summary: 查询物料的信息
      operationId: getMaterialTriInitialInfo
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/MaterialQueryRequest'
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/MaterialTriInitialInfo'
components:
  schemas:
    MaterialQueryRequest:
      type: object
      required:
        - materialList
      properties:
        materialList:
          type: array
          items:
            type: string
    MaterialTriInitialInfo:
      type: object
      properties:
        lcbh:
          type: string
`

		const [bundles, schemaType] = await ApiBasedToolSchemaParser.autoParseToToolBundle(
			yamlSpec
		)

		expect(schemaType).toBe(ApiProviderSchemaType.OPENAPI)
		expect(bundles).toHaveLength(1)
		expect(bundles[0].server_url).toBe('http://127.0.0.1:7001/BIService/Open/ChangeControl/GetMaterialTriInitialInfo')
		expect(bundles[0].method).toBe('post')
		expect(bundles[0].operation_id).toBe('getMaterialTriInitialInfo')
		expect(bundles[0].parameters?.[0].name).toBe('materialList')
		expect(bundles[0].parameters?.[0].required).toBe(true)
	})

	describe('parseOpenapiToToolBundle', () => {
		it('should parse openapi object to tool bundle', () => {
			const openapi = {
				info: { description: 'Test API' },
				servers: [{ url: 'http://localhost' }],
				paths: {
					'/test': {
						get: {
							operationId: 'getTest',
							parameters: [
								{
									name: 'param1',
									description: 'A parameter',
									required: true,
									schema: { type: 'string' }
								}
							],
							requestBody: {
								content: {
									'application/json': {
										schema: {
											type: 'object',
											properties: {
												bodyParam: { type: 'string', description: 'Body parameter' }
											}
										}
									}
								}
							}
						}
					}
				}
			}

			const result: ApiToolBundle[] = ApiBasedToolSchemaParser.parseOpenapiToToolBundle(openapi)
			expect(result).toHaveLength(1)
			expect(result[0].server_url).toBe('http://localhost/test')
			expect(result[0].method).toBe('get')
			expect(result[0].parameters).toHaveLength(2)
		})

		it('should throw an error if no servers are defined', () => {
			const openapi = {
				info: { description: 'Test API' },
				paths: {}
			}

			expect(() => {
				ApiBasedToolSchemaParser.parseOpenapiToToolBundle(openapi)
			}).toThrow('No server found in the openapi yaml.')
		})
	})

	describe('parseOpenapiYamlToToolBundle', () => {
		it('should parse openapi yaml string to tool bundle', () => {
			const yaml = `
        info:
          description: Test API
        servers:
          - url: http://localhost
        paths:
          /test:
            get:
              operationId: getTest
              parameters:
                - name: param1
                  description: A parameter
                  required: true
                  schema:
                    type: string
      `

			const result: ApiToolBundle[] = ApiBasedToolSchemaParser.parseOpenapiYamlToToolBundle(yaml)
			expect(result).toHaveLength(1)
			expect(result[0].server_url).toBe('http://localhost/test')
			expect(result[0].method).toBe('get')
		})

		it('should throw an error for invalid yaml', () => {
			const invalidYaml = `invalid: yaml`

			expect(() => {
				ApiBasedToolSchemaParser.parseOpenapiYamlToToolBundle(invalidYaml)
			}).toThrow('No server found in the openapi yaml.')
		})
	})

    it('should convert parameters to a Zod schema', () => {
        const parameters: ParameterObject[] = [
            {
                name: 'param1',
                in: 'query',
                required: true,
                schema: {
                    type: 'string',
                }
            },
            {
                name: 'param2',
                in: 'query',
                required: false,
                schema: {
                    type: 'integer',
                }
            }
        ];

        const zodSchema = ApiBasedToolSchemaParser.parseParametersToZod(parameters, {
			param2: 100
		})
        const parsedData = zodSchema.parse({ param1: 'test', param3: 123 });

		// param2 可以不填，param3 被忽略
        expect(parsedData).toEqual({ param1: 'test', param2: 100, });
    });

    it('should throw an error for invalid parameter data', () => {
        const parameters: ParameterObject[] = [
            {
                name: 'param1',
                in: 'query',
                required: true,
                schema: {
                    type: 'string'
                }
            }
        ];

        const zodSchema = ApiBasedToolSchemaParser.parseParametersToZod(parameters);

        expect(() => {
            zodSchema.parse({ param1: 123 });
        }).toThrow();
    });

	it('should parse OperationObject to JSON Schema for OpenAPI v3', () => {
		const operation: OperationObject = {
			operationId: 'createUser',
			parameters: [
				{
					name: 'limit',
					in: 'query',
					required: false,
					schema: { type: 'integer', default: 10 }
				} as ParameterObject
			],
			requestBody: {
				required: true,
				content: {
					'application/json': {
						schema: {
							type: 'object',
							required: ['name'],
							properties: {
								name: { type: 'string' },
								age: { type: 'integer', default: 18 }
							}
						}
					}
				}
			} as RequestBody
		}

		const jsonSchema = ApiBasedToolSchemaParser.parseOperationObjectToJSONSchema(operation)
		expect(jsonSchema.properties?.limit).toBeDefined()
		expect((jsonSchema.properties as any).age.default).toBe(18)
		expect(jsonSchema.required).toContain('name')
		expect(jsonSchema.required).not.toContain('age')
	})

	it('should parse swagger v2 style OperationObject with body parameter', () => {
		const swaggerOperation: OperationObject = {
			operationId: 'legacy',
			parameters: [
				{
					name: 'q',
					in: 'query',
					required: true,
					type: 'string',
					schema: {
						type: 'string',
					}
				} as ParameterObject,
				{
					name: 'payload',
					in: 'body',
					required: false,
					schema: {
						type: 'object',
						required: ['flag'],
						properties: {
							flag: { type: 'boolean' },
							count: { type: 'integer' }
						}
					}
				} as ParameterObject
			]
		}

		const jsonSchema = ApiBasedToolSchemaParser.parseOperationObjectToJSONSchema(swaggerOperation)
		expect((jsonSchema.properties as any).flag.type).toBe('boolean')
		expect(jsonSchema.required).toContain('q')
		expect(jsonSchema.required).toContain('flag')
	})


	it('convertPropertyValueType should correctly convert values based on type', () => {
		const propertyInteger = { type: 'integer' }
		const propertyNumber = { type: 'number' }
		const propertyString = { type: 'string' }
		const propertyBoolean = { type: 'boolean' }
		const propertyNull = { type: 'null' }
		const propertyObject = { type: 'object' }
		const propertyArray = { type: 'array' }

		expect(ApiBasedToolSchemaParser.convertPropertyValueType(propertyInteger, '123')).toBe(123)
		expect(ApiBasedToolSchemaParser.convertPropertyValueType(propertyNumber, '123.45')).toBe(123.45)
		expect(ApiBasedToolSchemaParser.convertPropertyValueType(propertyString, 123)).toBe('123')
		expect(ApiBasedToolSchemaParser.convertPropertyValueType(propertyBoolean, 'true')).toBe(true)
		expect(ApiBasedToolSchemaParser.convertPropertyValueType(propertyBoolean, 'false')).toBe(false)
		expect(ApiBasedToolSchemaParser.convertPropertyValueType(propertyNull, null)).toBe(null)
		expect(ApiBasedToolSchemaParser.convertPropertyValueType(propertyObject, '{"key": "value"}')).toEqual({ key: 'value' })
		expect(ApiBasedToolSchemaParser.convertPropertyValueType(propertyArray, '[1, 2, 3]')).toEqual([1, 2, 3])
	})

	it('convertPropertyAnyOf should correctly convert values based on anyOf schema', () => {
		const anyOfSchema = [
			{ type: 'integer' },
			{ type: 'boolean' },
			{ type: 'string' },
		]

		expect(ApiBasedToolSchemaParser.convertPropertyAnyOf({}, '123', anyOfSchema)).toBe(123)
		expect(ApiBasedToolSchemaParser.convertPropertyAnyOf({}, 'true', anyOfSchema)).toBe(true)
		expect(ApiBasedToolSchemaParser.convertPropertyAnyOf({}, 'hello', anyOfSchema)).toBe('hello')
		expect(ApiBasedToolSchemaParser.convertPropertyAnyOf({}, 'false', anyOfSchema)).toBe(false)
		expect(ApiBasedToolSchemaParser.convertPropertyAnyOf({}, '456.78', anyOfSchema)).toBe(456)
	})

	it('parseSwaggerToOpenapi should correctly convert swagger to openapi', () => {

		const openapiJsonPath = path.resolve(__dirname, '../provider/openapi/petstore-v3/openapi.json');
		const swagger = JSON.parse(fs.readFileSync(openapiJsonPath, 'utf8'));
		const openapi = ApiBasedToolSchemaParser.parseSwaggerToOpenapi(swagger);

		expect(openapi.openapi).toBe("3.0.0");
		expect(openapi.info.title).toBe("Swagger Petstore - OpenAPI 3.0");
		expect(openapi.servers).toHaveLength(1);
		expect(openapi.servers[0].url).toBe("/api/v3");

		expect(openapi.tags).toHaveLength(3);
		expect(openapi.tags[0].name).toBe("pet");
		expect(openapi.tags[1].name).toBe("store");
		expect(openapi.tags[2].name).toBe("user");

		expect(openapi.paths["/pet"]).toBeDefined();
		expect(openapi.paths["/pet"].put).toBeDefined();
		expect(openapi.paths["/pet"].put.operationId).toBe("updatePet");

		expect(openapi.components.schemas).toBeDefined();
		expect(openapi.components.schemas.Pet).toBeDefined();
		expect(openapi.components.schemas.User).toBeDefined();

		expect(openapi.components.requestBodies).toBeDefined();
		expect(openapi.components.requestBodies.Pet).toBeDefined();
		expect(openapi.components.requestBodies.UserArray).toBeDefined();

		expect(openapi.components.securitySchemes).toBeDefined();
		expect(openapi.components.securitySchemes.petstore_auth).toBeDefined();
		expect(openapi.components.securitySchemes.api_key).toBeDefined();
	});
})
