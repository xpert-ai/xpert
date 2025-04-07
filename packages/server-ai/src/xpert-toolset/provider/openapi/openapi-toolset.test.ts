import { OpenAPIToolset } from './openapi-toolset'
import { OpenAPITool } from './openapi/openapi-tool'
import * as fs from 'fs'
import * as path from 'path';
import { ApiAuthType, ApiToolBundle, XpertToolsetCategoryEnum } from '@metad/contracts'
import { ApiBasedToolSchemaParser } from '../../utils/parser';
import MockAdapter from 'axios-mock-adapter';
import axios from 'axios'

describe('OpenAPIToolset', () => {
    let toolset: OpenAPIToolset
	let oas = null
	let toolBundles: ApiToolBundle[]
	let mock: MockAdapter

	beforeAll(() => {
        const yamlPath = path.join(__dirname, './openapi/open-meteo/oas.yaml')
		oas = fs.readFileSync(yamlPath, 'utf8')
        toolBundles = ApiBasedToolSchemaParser.parseOpenapiYamlToToolBundle(oas)

    })

    beforeEach(() => {
		mock = new MockAdapter(axios)
        toolset = new OpenAPIToolset({
			name: 'Meteo Weather',
			type: 'openapi',
			category: XpertToolsetCategoryEnum.API,
			credentials: {
				auth_type: ApiAuthType.NONE
			},
			schema: oas,
			schemaType: 'openapi_yaml',
			tools: [
				{
					name: 'forecast',
					schema: ApiBasedToolSchemaParser.parseOpenAPIYamlToJSONSchema(oas, {path: '/forecast', operartor: 'get'}),
					options: {
						api_bundle: toolBundles[0]
					}
				}
			]
		})
    })

	afterEach(() => {
		mock.restore()
	})

    it('should return tools when getTools is called', () => {
        const tools = toolset.getTools()
        expect(tools).toBeInstanceOf(Array)
        expect(tools.length).toBe(1)
    })

    it('should parse JSON schema correctly', () => {
        const tools = toolset.getTools()
        expect(tools.length).toBe(1)
        expect(tools[0]).toBeInstanceOf(OpenAPITool)
        expect(tools[0].name).toBe('forecast')
    })

	it('invoke should perform a GET request and return response', async () => {
		const result = {
			"latitude": 52.52,
			"longitude": 13.419998,
			"generationtime_ms": 0.001072883605957,
			"utc_offset_seconds": 0,
			"timezone": "GMT",
			"timezone_abbreviation": "GMT",
			"elevation": 38.0
		}
		mock.onGet('https://api.open-meteo.com/v1/forecast').reply(200, result)

		const tools = toolset.getTools()
		const tool = tools[0]
		const _result = await tool.invoke({
            latitude: 52.52,
            longitude: 13.41
        })

        expect(_result).toEqual(JSON.stringify(result))
	})
	
})