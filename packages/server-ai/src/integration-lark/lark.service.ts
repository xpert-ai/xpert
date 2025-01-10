import * as lark from '@larksuiteoapi/node-sdk'
import { IIntegration, IUser, TranslateOptions } from '@metad/contracts'
import { nonNullable } from '@metad/copilot'
import { ConfigService, IEnvironment } from '@metad/server-config'
import { UserService, RoleService, RequestContext } from '@metad/server-core'
import { CACHE_MANAGER, Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Cache } from 'cache-manager'
import { isEqual } from 'date-fns'
import express from 'express'
import { filter, Observable, Observer, Subject, Subscriber } from 'rxjs'
import { I18nService } from 'nestjs-i18n';
import { LarkBotMenuCommand } from './commands'
import { ChatLarkContext, LarkMessage } from './types'
import { LarkConversationService } from './conversation.service'

@Injectable()
export class LarkService {
	private readonly logger = new Logger(LarkService.name)

	/**
	 * @deprecated 使用可恢复会话的方式
	 */
	private actions = new Map<string, Subject<any>>()

	private eventDispatchers = new Map<
		string,
		{
			integration: IIntegration
			client: lark.Client
			dispatcher: (req: any, res: any) => Promise<void>
			bot: {
				app_name: string
				avatar_url: string
				ip_white_list: string[]
				open_id: string
			}
		}
	>()

	constructor(
		private readonly conversation: LarkConversationService,
		private readonly userService: UserService,
		private readonly roleService: RoleService,
		private readonly configService: ConfigService,
		private readonly i18n: I18nService,
		private readonly commandBus: CommandBus,
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache
	) {}

	getOrCreateLarkClient(integration: IIntegration) {
		let item = this.eventDispatchers.get(integration.id)
		if (!item || !isEqual(item.integration.updatedAt, integration.updatedAt)) {
			if (item) { // debug
				console.log(
					item.integration.updatedAt,
					integration.updatedAt,
					!isEqual(item.integration.updatedAt, integration.updatedAt)
				)
			}
			const client = this.createClient(integration)
			item = {
				integration,
				client,
				dispatcher: lark.adaptExpress(
					this.createEventDispatcher(integration, client),
					{
						autoChallenge: true,
					}
				),
				bot: null
			}
			this.eventDispatchers.set(integration.id, item)
			this.getBotInfo(client).then((bot) => (item.bot = bot))
		}

		return item
	}

	webhookEventDispatcher(integration: IIntegration, req: express.Request, res: express.Response) {
		const item = this.getOrCreateLarkClient(integration)

		item.dispatcher(req, res).catch((err) => {
			// Error
			console.error(err)
		})
	}

	createClient(integration: IIntegration) {
		return new lark.Client({
			appId: integration.options.appId,
			appSecret: integration.options.appSecret,
			appType: lark.AppType.SelfBuild,
			domain: lark.Domain.Feishu,
			loggerLevel: lark.LoggerLevel.debug
		})
	}

	createEventDispatcher(integration: IIntegration, client: lark.Client) {
		const { xpertId } = integration.options ?? {}
		return new lark.EventDispatcher({
			verificationToken: integration.options.verificationToken,
			encryptKey: integration.options.encryptKey,
			loggerLevel: lark.LoggerLevel.debug
		}).register({
			'im.message.receive_v1': async (data) => {
				/**
				 * {
					schema: '2.0',
					event_id: 'b47ff4f15c86d5af497d75da76f90a84',
					token: '',
					create_time: '1723552741302',
					event_type: 'im.message.receive_v1',
					tenant_key: '',
					app_id: '',
					message: {
						chat_id: 'oc_3d8956dd83110e5e88f319613db55d94',
						chat_type: 'p2p' | 'group',
						content: '{"text":"HI"}',
						create_time: '1723552740951',
						message_id: 'om_d6c3ef63049d7a7d5963f02b72f5d5b8',
						message_type: 'text',
						update_time: '1723552740951'
					},
					sender: {
						sender_id: {
						  open_id: '',
						  union_id: '',
						  user_id: '327b132g'
						},
						sender_type: 'user',
						tenant_key: ''
					},
					[Symbol(event-type)]: 'im.message.receive_v1'
				  }
				 */

				// const tenant = await this.tenantService.findOne({ id: environment.larkConfig.tenantId })
				// const organizationId = environment.larkConfig.organizationId
				const tenant = integration.tenant
				const organizationId = integration.organizationId
				const bot = this.eventDispatchers.get(integration.id).bot
				const chatId = data.message.chat_id

				if (
					!(
						data.message.chat_type === 'p2p' ||
						data.message.mentions?.some((mention) => mention.id.open_id === bot?.open_id)
					)
				) {
					return true
				}

				// if (data.message.chat_type === 'p2p') {
				// 	const result = await this.interactiveMessage({ chatId } as ChatLarkContext, {
				// 		elements: []
				// 	})
				// 	return true
				// }

				this.logger.verbose('im.message.receive_v1:')
				this.logger.verbose(data)

				try {
				    const user = RequestContext.currentUser()
					const userQueue = await this.conversation.getUserQueue(user.id)
					// Adding task to user's queue
    				await userQueue.add({
						tenant,
						organizationId,
						integrationId: integration.id,
						// integration,
						userId: user.id,
						message: data as any,
						chatId,
						chatType: data.message.chat_type,
					})
				} catch(err) {
					console.error(err)
				}

				this.logger.verbose('Return for message:' + data.event_id)
				return 'ok'
			},
			'application.bot.menu_v6': async (data) => {
				/**
				 * {
					schema: '2.0',
					event_id: '3632caaa3c0143c072b2149c5b58ae8f',
					token: '',
					create_time: '1723551863000',
					event_type: 'application.bot.menu_v6',
					tenant_key: '',
					app_id: 'cli_a6300438b435100b',
					event_key: 'select_cube_sales',
					operator: {
						operator_id: {
							open_id: '',
							union_id: '',
							user_id: '327b132g'
						}
					},
					timestamp: 1723551863,
					[Symbol(event-type)]: 'application.bot.menu_v6'
				  }
				 * 
				 */
				// const { event_key } = data
				this.logger.verbose('application.bot.menu_v6:')
				this.logger.verbose(data)
				// const organizationId = environment.larkConfig.organizationId
				// const tenant = await this.tenantService.findOne({ id: environment.larkConfig.tenantId })
				const tenant = integration.tenant
				const organizationId = integration.organizationId
				const result = await this.commandBus.execute<LarkBotMenuCommand, Observable<any>>(
					new LarkBotMenuCommand({
						tenant,
						organizationId,
						message: data as any
					})
				)

				result.pipe(filter(nonNullable)).subscribe(async (message) => {
					await client.im.message.create(message)
				})

				return true
			},
			'card.action.trigger': async (data) => {
				/**
				 * {
					schema: '2.0',
					event_id: 'd972d3653c29ef5307e80e9a08cf099f',
					token: 'c-t',
					create_time: '1723625509226706',
					event_type: 'card.action.trigger',
					tenant_key: '',
					app_id: '',
					operator: {
						tenant_key: '',
						open_id: '',
						union_id: ''
					},
					action: { tag: 'select_static', option: '1' },
					host: 'im_message',
					context: {
						open_message_id: 'om_dd02538d5ecaf1b861c7d748deb3f189',
						open_chat_id: 'oc_f1a6cd3129de01656f2e9f4c3083b3a0'
					},
					[Symbol(event-type)]: 'card.action.trigger'
				  }
				 */
				this.logger.verbose('card.action.trigger:')
				this.logger.verbose(data)
				const messageId = data.context.open_message_id
				if (messageId && xpertId) {
					const user = RequestContext.currentUser()
					const tenant = integration.tenant
					const organizationId = integration.organizationId
					// Does not block onAction execution and returns to Lark immediately
					setTimeout(() => {
						this.conversation.onAction(
							data.action.value,
							{
								tenant,
								organizationId,
								integrationId: integration.id,
								userId: user.id,
								chatId: data.context.open_chat_id
							},
							user.id,
							xpertId
						).catch((err) => this.logger.error(err))
					}, 500)
					return true
				} else {
					this.errorMessage(
						{ integrationId: integration.id, chatId: data.context.open_chat_id },
						new Error(`出现内部错误！`)
					)
				}
				return false
			}
		})
	}

	async getBotInfo(client: lark.Client) {
		const res = await client.request({
			method: 'GET',
			url: 'https://open.feishu.cn/open-apis/bot/v3/info',
			data: {},
			params: {}
		})

		return res.bot
	}

	getClient(id: string) {
		return this.eventDispatchers.get(id)?.client
	}

	async test(integration: IIntegration,) {
		const client = this.createClient(integration)
		return await this.getBotInfo(client)
	}

	async getUser(client: lark.Client, tenantId: string, unionId: string) {
		// From cache
		let user = await this.cacheManager.get<IUser>('user/' + tenantId + '/' + unionId)
		if (user) {
			return user
		}

		try {
			user = await this.userService.findOneByConditions({
				tenantId,
				thirdPartyId: unionId
			})
		} catch (err) {
			//
		}

		if (!user) {
			// 对于外部用户可能会无权获取用户信息
			let larkUser = null
			try {
				larkUser = await client.contact.user.get({
					params: {
						user_id_type: "union_id",
					},
					path: {
						user_id: unionId
					}
				})
			} catch(err) {
				//
			}

			// Lark user role
			const larkConfig = this.configService.get('larkConfig') as IEnvironment['larkConfig']
			const _role = await this.roleService.findOneOrFail({where: {tenantId: tenantId, name: larkConfig.roleName }})

			user = await this.userService.create({
				tenantId,
				thirdPartyId: unionId,
				username: larkUser?.data.user.user_id,
				email: larkUser?.data.user.email,
				mobile: larkUser?.data.user.mobile,
				imageUrl: larkUser?.data.user.avatar?.avatar_240,
				firstName: larkUser?.data.user.name,
				roleId: _role.record?.id
			})
		}

		if (user) {
			await this.cacheManager.set('user/' + tenantId + '/' + unionId, user)
			
		}
		
		return user
	}

	async createMessage(integrationId: string, message: LarkMessage) {
		try {
			return await this.getClient(integrationId).im.message.create(message)
		} catch (err) {
			this.logger.error(err)
		}
	}

	async patchMessage(
		integrationId: string,
		payload?: {
			data: {
				content: string
			}
			path: {
				message_id: string
			}
		}
	) {
		try {
			return await this.getClient(integrationId).im.message.patch(payload)
		} catch (err) {
			this.logger.error(err)
		}
	}

	async errorMessage({ integrationId, chatId }: { integrationId: string; chatId?: string }, err: Error) {
		await this.createMessage(integrationId, {
			params: {
				receive_id_type: 'chat_id'
			},
			data: {
				receive_id: chatId,
				content: JSON.stringify({ text: `Error:` + err.message }),
				msg_type: 'text'
			}
		} as LarkMessage)
	}

	async textMessage(context: { integrationId: string; chatId: string; messageId: string }, content: string) {
		const { chatId, messageId } = context
		if (messageId) {
			return await this.patchMessage(context.integrationId, {
				data: {
					content: JSON.stringify({ text: content })
				},
				path: {
					message_id: messageId
				}
			})
		}
		return await this.createMessage(context.integrationId, {
			params: {
				receive_id_type: 'chat_id'
			},
			data: {
				receive_id: chatId,
				content: JSON.stringify({ text: content }),
				msg_type: 'text'
			}
		} as LarkMessage)
	}

	async interactiveMessage(context: ChatLarkContext, data: any) {
		return await this.createMessage(context.integrationId, {
			params: {
				receive_id_type: 'chat_id'
			},
			data: {
				receive_id: context.chatId,
				content: JSON.stringify(data),
				msg_type: 'interactive'
			}
		} as LarkMessage)
	}

	async markdownMessage(context: ChatLarkContext, content: string) {
		await this.createMessage(context.integrationId, {
			params: {
				receive_id_type: 'chat_id'
			},
			data: {
				receive_id: context.chatId,
				content: JSON.stringify({
					elements: [
						{
							tag: 'markdown',
							content
						}
					]
				}),
				msg_type: 'interactive'
			}
		} as LarkMessage)
	}

	async patchInteractiveMessage(integrationId: string, messageId: string, data: any) {
		return await this.patchMessage(integrationId, {
			data: {
				content: JSON.stringify(data)
			},
			path: {
				message_id: messageId
			}
		})
	}

	async interactiveActionMessage(
		context: ChatLarkContext,
		data: any,
		subscriber?: Partial<Observer<any>> | ((value: any) => void)
	) {
		const message = await this.createMessage(context.integrationId, {
			params: {
				receive_id_type: 'chat_id'
			},
			data: {
				receive_id: context.chatId,
				content: JSON.stringify(data),
				msg_type: 'interactive'
			}
		} as LarkMessage)

		if (!message) {
			throw new Error(`Can't send lark message`)
		}

		const messageId = message.data.message_id
		const response = new Subject<any>()
		this.actions.set(messageId, response)
		// 超时时间 10m
		setTimeout(
			() => {
				response.complete()
				this.actions.delete(messageId)
			},
			1000 * 60 * 10
		)
		response.subscribe(subscriber)
		return message
	}

	createAction({ integrationId, chatId }: ChatLarkContext, content: any) {
		return new Observable<{ value: any }>((subscriber: Subscriber<unknown>) => {
			this.getClient(integrationId)
				.im.message.create({
					data: {
						receive_id: chatId,
						content: JSON.stringify(content),
						msg_type: 'interactive'
					},
					params: {
						receive_id_type: 'chat_id'
					}
				})
				.then((res) => {
					const messageId = res.data.message_id
					const response = new Subject<any>()
					this.actions.set(messageId, response)
					// 超时时间 10m
					setTimeout(
						() => {
							response.complete()
							this.actions.delete(messageId)
						},
						1000 * 60 * 10
					)
					response.subscribe({
						next: (message) => {
							subscriber.next(message)
						},
						error: (err) => {
							subscriber.error(err)
						},
						complete: () => {
							subscriber.complete()
						}
					})
				})
				.catch((err) => subscriber.error(err))
		})
	}

	async patchAction({ integrationId }: ChatLarkContext, messageId: string, content: any) {
		await this.getClient(integrationId).im.message.patch({
			data: {
				content: JSON.stringify(content)
			},
			path: {
				message_id: messageId
			}
		})
	}

	async translate(key: string, options: TranslateOptions) {
		return await this.i18n.t(key, options)
	}
}
