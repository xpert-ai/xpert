import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { RunnableConfig } from '@langchain/core/runnables'
import { ToolParams } from '@langchain/core/tools'
import { ApiAuthType, ApiToolBundle, IXpertTool, XpertToolsetCategoryEnum } from '@metad/contracts'
import axios, { AxiosResponse } from 'axios'
import { ToolParameterValidationError, ToolProviderCredentialValidationError } from '../../../errors'
import { BaseTool } from '../../../toolset'
import { ApiBasedToolSchemaParser } from '../../../utils/parser'

const API_TOOL_DEFAULT_TIMEOUT = [
	parseInt(process.env.API_TOOL_DEFAULT_CONNECT_TIMEOUT || '10'),
	parseInt(process.env.API_TOOL_DEFAULT_READ_TIMEOUT || '60')
]

export class OpenAPITool extends BaseTool {
	public name: string
	public description: string

	providerType = XpertToolsetCategoryEnum.API

	protected api_bundle: ApiToolBundle

	constructor(
		protected xpertTool: IXpertTool,
		fields?: ToolParams
	) {
		super(fields)

        this.name = xpertTool.name
        this.description = xpertTool.description
		this.api_bundle = xpertTool.options?.api_bundle
		// this.toolset = xpertTool.toolset

		if (xpertTool.schema) {
			this.schema = ApiBasedToolSchemaParser.parseParametersToZod(xpertTool.schema.parameters ?? [] /* Default empty */) as unknown as typeof this.schema
		}
	}

	async validate_credentials(credentials: Record<string, any>, parameters: Record<string, any>, format_only = false) {
		const headers = this.assembling_request(parameters, credentials)

		if (format_only) {
			return ''
		}

		const response = await this.do_http_request(
			this.api_bundle.server_url,
			this.api_bundle.method,
			headers,
			parameters
		)
		return this.validate_and_parse_response(response)
	}

	assembling_request(parameters: Record<string, any>, _credentials?): Record<string, any> {
		const headers: Record<string, any> = {}
		const credentials = _credentials || this.xpertTool.toolset?.credentials || {}

		if (!credentials.auth_type) {
			throw new ToolProviderCredentialValidationError('Missing auth_type')
		}

		if (credentials.auth_type === ApiAuthType.API_KEY) {
			let api_key_header = ApiAuthType.API_KEY

			if (credentials.api_key_header) {
				api_key_header = credentials.api_key_header
			}

			if (!credentials.api_key_value) {
				throw new ToolProviderCredentialValidationError('Missing api_key_value')
			} else if (typeof credentials.api_key_value !== 'string') {
				throw new ToolProviderCredentialValidationError('api_key_value must be a string')
			}

			if (credentials.api_key_header_prefix) {
				const api_key_header_prefix = credentials.api_key_header_prefix
				if (api_key_header_prefix === 'basic' && credentials.api_key_value) {
					credentials.api_key_value = `Basic ${credentials.api_key_value}`
				} else if (api_key_header_prefix === 'bearer' && credentials.api_key_value) {
					credentials.api_key_value = `Bearer ${credentials.api_key_value}`
				} else if (api_key_header_prefix === 'custom') {
					// Do nothing
				}
			}

			headers[api_key_header] = credentials.api_key_value
		}

		const needed_parameters = this.api_bundle.parameters.filter((parameter) => parameter.required)
		for (const parameter of needed_parameters) {
			if (parameter.required && !(parameter.name in parameters)) {
				throw new ToolParameterValidationError(`Missing required parameter ${parameter.name}`)
			}

			if (parameter.default !== undefined && !(parameter.name in parameters)) {
				parameters[parameter.name] = parameter.default
			}
		}

		return headers
	}

	validate_and_parse_response(response: AxiosResponse): string {
		/**
		 * validate the response
		 */
		if (response instanceof Object) {
			if (response.status >= 400) {
				throw new Error(`Request failed with status code ${response.status} and ${response.statusText}`)
			}
			if (!response.data) {
				return 'Empty response from the tool, please check your parameters and try again.'
			}
			try {
				const responseData = response.data
				try {
					return JSON.stringify(responseData)
				} catch (e) {
					return JSON.stringify(responseData)
				}
			} catch (e) {
				return response.data
			}
		} else {
			throw new Error(`Invalid response type ${typeof response}`)
		}
	}

	static get_parameter_value(parameter: any, parameters: Record<string, any>): any {
		if (parameter.name in parameters) {
			return parameters[parameter.name]
		} else if (parameter.required) {
			throw new ToolParameterValidationError(`Missing required parameter ${parameter.name}`)
		} else {
			return (parameter.schema || {}).default || ''
		}
	}

	async do_http_request(
		url: string,
		method: string,
		headers: Record<string, any>,
		parameters: Record<string, any>
	): Promise<AxiosResponse> {
		method = method.toLowerCase()

		const params: Record<string, any> = {}
		const pathParams: Record<string, any> = {}
		let body: any = {}
		const cookies: Record<string, any> = {}

		for (const parameter of this.api_bundle.openapi.parameters || []) {
			const value = OpenAPITool.get_parameter_value(parameter, parameters)
			if (parameter.in === 'path') {
				pathParams[parameter.name] = value
			} else if (parameter.in === 'query') {
				if (value !== '') {
					params[parameter.name] = value
				}
			} else if (parameter.in === 'cookie') {
				cookies[parameter.name] = value
			} else if (parameter.in === 'header') {
				headers[parameter.name] = value
			}
		}

		if (this.api_bundle.openapi.requestBody) {
			const requestBody = this.api_bundle.openapi.requestBody
			if (requestBody.content) {
				for (const contentType in requestBody.content) {
					headers['Content-Type'] = contentType
					const bodySchema = requestBody.content[contentType].schema
					const required = bodySchema.required || []
					const properties = bodySchema.properties || {}
					for (const name in properties) {
						if (name in parameters) {
							body[name] = ApiBasedToolSchemaParser.convertPropertyValueType(properties[name], parameters[name])
						} else if (required.includes(name)) {
							throw new ToolParameterValidationError(
								`Missing required parameter ${name} in operation ${this.api_bundle.operation_id}`
							)
						} else if ('default' in properties[name]) {
							body[name] = properties[name].default
						} else {
							body[name] = null
						}
					}
					break
				}
			}
		}

		for (const name in pathParams) {
			url = url.replace(`{${name}}`, `${pathParams[name]}`)
		}

		if (headers['Content-Type']) {
			if (headers['Content-Type'] === 'application/json') {
				body = JSON.stringify(body)
			} else if (headers['Content-Type'] === 'application/x-www-form-urlencoded') {
				body = new URLSearchParams(body).toString()
			}
		}

		if (['get', 'head', 'post', 'put', 'delete', 'patch'].includes(method)) {
			try {
				const response = await axios({
					method: method as any, // Type assertion to satisfy TypeScript
					url: url,
					params: params,
					headers: headers,
					data: body,
					withCredentials: true, // To include cookies in the request
					timeout: 60000, // Example timeout, adjust as needed
					maxRedirects: 5 // Example follow redirects, adjust as needed
				})

				return response
			} catch (error) {
				throw new Error(`HTTP request failed: ${error}`)
			}
		} else {
			throw new Error(`Invalid HTTP method ${method}`)
		}
	}

	getBaseUrl() {
		return this.xpertTool.toolset.options?.baseUrl
	}

	protected async _call(
		toolParameters: any,
		runManager?: CallbackManagerForToolRun,
		parentConfig?: RunnableConfig
	): Promise<any> {
		// assemble request
		const headers = this.assembling_request(toolParameters)

		let url = this.api_bundle.server_url
		const baseUrl = this.getBaseUrl()
		if (baseUrl) {
			url = (baseUrl.endsWith('/') ? baseUrl.slice(0, baseUrl.length - 1) : baseUrl) + url
		}

		// do http request
		const response = await this.do_http_request(
			url,
			this.api_bundle.method,
			headers,
			toolParameters
		)

		// validate response
		const validatedResponse = this.validate_and_parse_response(response)

		// assemble invoke message
		return validatedResponse
	}
}
