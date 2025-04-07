import { ApiAuthType, ApiToolBundle, IXpertTool } from '@metad/contracts'
import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'
import * as fs from 'fs'
import * as path from 'path';
import { ApiBasedToolSchemaParser } from '../../../utils/parser'
import { OpenAPITool } from './openapi-tool'

describe('OpenAPITool', () => {
	let mock: MockAdapter
	let tool: OpenAPITool
	const apiBundle: ApiToolBundle = {
		author: '',
		server_url: 'http://example.com/api',
		method: 'GET',
		parameters: [],
		openapi: {
			parameters: [],
			requestBody: null
		},
		operation_id: 'testOperation'
	}
    const xpertTool = {
        options: {
            api_bundle: apiBundle
        }
    } as unknown as IXpertTool

	beforeEach(() => {
		mock = new MockAdapter(axios)
		tool = new OpenAPITool(xpertTool, {} as any)
	})

	afterEach(() => {
		mock.restore()
	})

	test('validate_credentials should return empty string when format_only is true', async () => {
		const result = await tool.validate_credentials(
			{
				auth_type: ApiAuthType.API_KEY,
				api_key_value: 'xxxxx'
			},
			{},
			true
		)

		expect(result).toBe('')
	})

	test('do_http_request should perform a GET request and return response', async () => {
		mock.onGet('http://example.com/api').reply(200, { success: true })

		const response = await tool.do_http_request('http://example.com/api', 'GET', {}, {})
		expect(response.data).toEqual({ success: true })
	})

	test('validate_and_parse_response should throw error for status >= 400', () => {
		const response = { status: 404, statusText: 'Not Found', data: null } as any
		expect(() => tool.validate_and_parse_response(response)).toThrow(
			'Request failed with status code 404 and Not Found'
		)
	})

	test('validate_and_parse_response should return stringified data for valid response', () => {
		const response = { status: 200, data: { message: 'Success' } } as any
		const result = tool.validate_and_parse_response(response)
		expect(result).toBe(JSON.stringify({ message: 'Success' }))
	})

})

describe('OpenAPITool: Open Meteo', () => {
	let mock: MockAdapter
	let tool: OpenAPITool
	let toolBundles: ApiToolBundle[]
    const xpertTool = {options: {}} as any

    beforeAll(() => {
        const yamlPath = path.join(__dirname, './open-meteo/oas.yaml')
		const yamlContent = fs.readFileSync(yamlPath, 'utf8')
        toolBundles = ApiBasedToolSchemaParser.parseOpenapiYamlToToolBundle(yamlContent)
        xpertTool.options.api_bundle = toolBundles[0]
        xpertTool.schema = ApiBasedToolSchemaParser.parseOpenAPIYamlToJSONSchema(yamlContent, {path: '/forecast', operartor: 'get'})
    })

	beforeEach(() => {
		mock = new MockAdapter(axios)
		tool = new OpenAPITool(xpertTool, {runtime: {credentials: {auth_type: 'None'}}})
	})

	afterEach(() => {
		mock.restore()
	})

	test('validate_credentials should return empty string', async () => {
		const result = await tool.validate_credentials(
			{
				auth_type: ApiAuthType.API_KEY,
				api_key_value: 'xxxxx'
			},
			{
                latitude: 52.52,
                longitude: 13.41
            },
			true
		)

		expect(result).toBe('')
	})

    test('invoke should perform a GET request and return response', async () => {
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

        const _result = await tool.invoke({
            latitude: 52.52,
            longitude: 13.41
        })

        expect(_result).toEqual(JSON.stringify(result))
	})
})
