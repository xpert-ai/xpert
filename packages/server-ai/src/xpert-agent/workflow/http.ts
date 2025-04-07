import { PromptTemplate } from '@langchain/core/prompts'
import { RunnableLambda } from '@langchain/core/runnables'
import { END } from '@langchain/langgraph'
import { ApiAuthType, channelName, IWFNHttp, TXpertGraph, TXpertTeamNode } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { CommandBus } from '@nestjs/cqrs'
import axios from 'axios'
import https from 'https'
import { AgentStateAnnotation } from '../commands/handlers/types'
import { XpertConfigException } from '../../core'

const ErrorChannelName = 'error'
export const StatusCodeChannelName = 'status_code'
export const HeadersChannelName = 'headers'
export const ReqUrlChannelName = 'request_url'
export const ReqMethodChannelName = 'request_method'
export const ReqBodyChannelName = 'request_body'

export function createHttpNode(
	commandBus: CommandBus,
	graph: TXpertGraph,
	node: TXpertTeamNode & { type: 'workflow' }
) {
	const entity = node.entity as IWFNHttp

	return {
		workflowNode: {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				console.log(entity)

				if (!entity.url) {
					throw new XpertConfigException(`Url of http node '${node.key}' is empty!`)
				}
				const url = await PromptTemplate.fromTemplate(entity.url, {templateFormat: 'mustache'}).format(state)

				const params = {}
				if (entity.params) {
				for await (const param of entity.params)
				  if (param.key) {
					const key = await PromptTemplate.fromTemplate(param.key, {templateFormat: 'mustache'}).format(state)
					params[key] = await PromptTemplate.fromTemplate(param.value, {templateFormat: 'mustache'}).format(state)
				  }
				}
				const headers: Record<string, string> = {}
				for await (const header of entity.headers) {
					if (header.name) {
					  const name = await PromptTemplate.fromTemplate(header.name, {templateFormat: 'mustache'}).format(state)
					  headers[name] = await PromptTemplate.fromTemplate(header.value, {templateFormat: 'mustache'}).format(state)
					}
				}
				if (entity.authorization?.auth_type === ApiAuthType.BASIC) {
					const username = await PromptTemplate.fromTemplate(entity.authorization.username, {templateFormat: 'mustache'}).format(state)
					const password = await PromptTemplate.fromTemplate(entity.authorization.password, {templateFormat: 'mustache'}).format(state)
					const base64Credentials = Buffer.from(`${username}:${password}`).toString('base64')
					headers['Authorization'] = `Basic ${base64Credentials}`
				} else if (entity.authorization?.auth_type === ApiAuthType.API_KEY) {
					const api_key_value = await PromptTemplate.fromTemplate(entity.authorization.api_key_value, {templateFormat: 'mustache'}).format(state)
					switch(entity.authorization.api_key_type) {
						case ('bearar'): {
							headers['Authorization'] = `Bearer ${api_key_value}`
							break
						}
						case ('custom'): {
							headers[entity.authorization.api_key_header] = api_key_value
							break
						}
						default: {
							headers['Authorization'] = `Basic ${api_key_value}`
						}
					}
				}
				let body = null
				switch(entity.body?.type) {
					case ('raw'):
				}
				if (entity.body?.body) {
					body = await PromptTemplate.fromTemplate(entity.body.body, {templateFormat: 'mustache'}).format(state)
					if (entity.body?.type === 'json') {
						body = JSON.parse(body)
					}
				}
				if (entity.body?.type === 'x-www-form-urlencoded') {
					headers['Content-Type'] = 'application/x-www-form-urlencoded'
					const params = new URLSearchParams()
					for await (const param of entity.body.encodedForm) {
						const key = await PromptTemplate.fromTemplate(param.key, {templateFormat: 'mustache'}).format(state)
						const value = await PromptTemplate.fromTemplate(param.value, {templateFormat: 'mustache'}).format(state)
						params.append(key, value)
						body = params
					}
				}
				
				let tryCount = 0
				const maxRetry = entity.retry?.enabled ? (entity.retry.stopAfterAttempt ?? 1) : 0
				while (tryCount <= maxRetry) {
					tryCount++
					try {
						const agent = new https.Agent({
							timeout: entity.connectionTimeout ? entity.connectionTimeout * 1000 : null
						  })
						const response = await axios({
							method: entity.method || 'get',
							httpsAgent: agent,
							url,
							params,
							headers,
							data: body,
							withCredentials: true, // To include cookies in the request
							timeout: Math.max(entity.readTimeout, entity.writeTimeout, 10) * 1000,
							maxRedirects: 5 // Example follow redirects, adjust as needed
						})

						return {
							[channelName(node.key)]: {
								[ReqUrlChannelName]: response.config.url,
								[ReqMethodChannelName]: response.config.method,
								[ReqBodyChannelName]: response.config.data,
								[StatusCodeChannelName]: response.status,
								[HeadersChannelName]: response.headers as Record<string, string>,
								body: response.data,
							}
						}
					} catch (err) {
						if (tryCount > maxRetry) {
							if (entity.errorHandling?.type === 'defaultValue') {
								return {
									[channelName(node.key)]: entity.errorHandling.defaultValue
								}
							}
							if (entity.errorHandling?.type === 'failBranch') {
								return {
									[channelName(node.key)]: {
										[ErrorChannelName]: getErrorMessage(err)
									}
								}
							}
							throw err
						}
						
						await new Promise(resolve => setTimeout(resolve, (entity.retry?.retryInterval ?? 1) * 1000))
					}
				}
				
			}),
			ends: []
		},
		navigator: async (state: typeof AgentStateAnnotation.State, config) => {
			if (state[channelName(node.key)][ErrorChannelName]) {
				return (
					graph.connections.find((conn) => conn.type === 'edge' && conn.from === `${node.key}/fail`)
						?.to ?? END
				)
			}
			return graph.connections.find((conn) => conn.type === 'edge' && conn.from === node.key)?.to ?? END
		}
	}
}
