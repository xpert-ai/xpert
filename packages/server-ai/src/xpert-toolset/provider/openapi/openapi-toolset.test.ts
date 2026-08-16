import { OpenAPIToolset } from './openapi-toolset'
import { OpenAPITool } from './tools/openapi-tool'
import * as fs from 'fs'
import * as path from 'path'
import { ApiAuthType, ApiToolBundle, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { ApiBasedToolSchemaParser } from '../../utils/parser'
import MockAdapter from 'axios-mock-adapter'
import axios from 'axios'

describe('OpenAPIToolset', () => {
    let toolset: OpenAPIToolset
    let oas = null
    let toolBundles: ApiToolBundle[]
    let mock: MockAdapter
    let reportUsage: jest.Mock

    beforeAll(() => {
        const yamlPath = path.join(__dirname, './open-meteo/oas.yaml')
        oas = fs.readFileSync(yamlPath, 'utf8')
        toolBundles = ApiBasedToolSchemaParser.parseOpenapiYamlToToolBundle(oas)
    })

    beforeEach(() => {
        mock = new MockAdapter(axios)
        reportUsage = jest.fn()
        toolset = new OpenAPIToolset(
            {
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
                        schema: ApiBasedToolSchemaParser.parseOpenAPIYamlToJSONSchema(oas, {
                            path: '/forecast',
                            operartor: 'get'
                        }),
                        options: {
                            api_bundle: toolBundles[0]
                        }
                    }
                ]
            },
            reportUsage
        )
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
            latitude: 52.52,
            longitude: 13.419998,
            generationtime_ms: 0.001072883605957,
            utc_offset_seconds: 0,
            timezone: 'GMT',
            timezone_abbreviation: 'GMT',
            elevation: 38.0
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

    it('reports OpenAI-compatible usage returned by the API tool', async () => {
        mock.onGet('https://api.open-meteo.com/v1/forecast').reply(200, {
            id: 'chatcmpl-1',
            model: 'Qwen/Qwen2.5-VL-72B-Instruct',
            usage: {
                prompt_tokens: 7632,
                completion_tokens: 185,
                total_tokens: 7817,
                prompt_tokens_details: {
                    cached_tokens: 0,
                    image_tokens: 2122,
                    text_tokens: 5510
                }
            }
        })

        await toolset.getTools()[0].invoke({ latitude: 52.52, longitude: 13.41 })

        expect(reportUsage).toHaveBeenCalledWith({
            requestId: 'chatcmpl-1',
            provider: 'Meteo Weather',
            model: 'Qwen/Qwen2.5-VL-72B-Instruct',
            promptTokens: 7632,
            completionTokens: 185,
            totalTokens: 7817
        })
    })

    it('does not report usage without a provider request id', async () => {
        mock.onGet('https://api.open-meteo.com/v1/forecast').reply(200, {
            usage: {
                prompt_tokens: 10,
                completion_tokens: 2,
                total_tokens: 12
            }
        })

        await toolset.getTools()[0].invoke({ latitude: 52.52, longitude: 13.41 })

        expect(reportUsage).not.toHaveBeenCalled()
    })
})
