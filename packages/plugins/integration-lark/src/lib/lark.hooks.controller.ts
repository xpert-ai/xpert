import * as lark from '@larksuiteoapi/node-sdk'
import { IIntegration, mapTranslationLanguage, TIntegrationLarkOptions, TranslationLanguageMap } from '@metad/contracts'
import { RequestContext, TChatEventContext, TChatEventHandlers } from '@xpert-ai/plugin-sdk'
import {
	BadRequestException,
	Body,
	Controller,
	ForbiddenException,
	Get,
	HttpCode,
	Param,
	Post,
	Query,
	Request,
	Response,
	UseGuards
} from '@nestjs/common'
import { AxiosError } from 'axios'
import express from 'express'
import { LarkAuthGuard } from './auth/lark-auth.guard'
import { Public } from './decorators/public.decorator'
import { LarkChannelStrategy } from './lark-channel.strategy'
import { LarkChannelRuntimeManager } from './lark-channel-runtime.manager'
import { LarkConversationService } from './conversation.service'
import { LarkService } from './lark.service'
import { LarkCoreApi } from './lark-core-api.service'

@Controller('lark')
export class LarkHooksController {
	constructor(
		private readonly larkService: LarkService,
		private readonly larkChannel: LarkChannelStrategy,
		private readonly conversation: LarkConversationService,
		private readonly core: LarkCoreApi,
		private readonly channelRuntimeManager: LarkChannelRuntimeManager
	) {}

	@Public()
	@UseGuards(LarkAuthGuard)
	@Post('webhook/:id')
	@HttpCode(200) // response code 200 required by lark server
	async webhook(
		@Param('id') integrationId: string,
		@Request() req: express.Request,
		@Response() res: express.Response
	): Promise<void> {
		const integration = await this.core.integration.findById(integrationId, { relations: ['tenant'] })
		if (!integration) {
			throw new BadRequestException(`Integration ${integrationId} not found. Please save the integration first before configuring webhook URL in Lark.`)
		}

		// Handle Lark webhook URL verification challenge explicitly (plain + encrypted body).
		// This avoids dispatching to event handlers and prevents 500 on malformed encrypted challenge payloads.
		const challenge = this.resolveUrlVerificationChallenge(req.body, integration.options)
		if (challenge) {
			res.status(200).json({ challenge })
			return
		}

		const accountId = integration.id
		const isRunning = this.channelRuntimeManager.isAccountRunning(
			'lark',
			integration.id,
			accountId
		)
		if (!isRunning) {
			res.status(503).json({
				code: 'ACCOUNT_RUNTIME_STOPPED',
				message: `Lark account runtime is stopped for integration ${integration.id}`,
				integrationId: integration.id,
				accountId
			})
			return
		}

		const ctx: TChatEventContext<TIntegrationLarkOptions> = {
			integration,
			tenantId: integration.tenantId,
			organizationId: integration.organizationId
		}

		const handlers: TChatEventHandlers = {
			onMessage: async (message, eventCtx) => {
				// Handle private chat message - delegate to ConversationService
				await this.conversation.handleMessage(message, eventCtx)
			},
			onCardAction: async (action, eventCtx) => {
				// Handle card button click
				await this.conversation.handleCardAction(action, eventCtx)
			},
			onMention: async (message, eventCtx) => {
				// Handle @mention in group chat - same as private message
				await this.conversation.handleMessage(message, eventCtx)
			}
		}

		try {
			const handler = this.larkChannel.createEventHandler(ctx, handlers)
			await handler(req, res)
		} catch (error) {
			this.channelRuntimeManager.noteAccountError('lark', integration.id, accountId, error)
			throw error
		}
	}

	private resolveUrlVerificationChallenge(body: any, options: TIntegrationLarkOptions): string | null {
		const verify = (payload: any) => {
			if (payload?.type !== 'url_verification') {
				return null
			}

			if (!payload?.challenge) {
				throw new BadRequestException('Missing challenge in Lark url_verification payload')
			}

			if (options?.verificationToken && payload?.token !== options.verificationToken) {
				throw new ForbiddenException('Invalid Lark verification token')
			}

			return payload.challenge as string
		}

		if (body?.type === 'url_verification') {
			return verify(body)
		}

		// Encrypted webhook payload usually contains only one field: { encrypt: "..." }.
		if (body?.encrypt && Object.keys(body).length === 1) {
			if (!options?.encryptKey) {
				throw new BadRequestException('Encrypt Key is required for encrypted Lark webhook payload')
			}

			try {
				const decrypted = new lark.AESCipher(options.encryptKey).decrypt(body.encrypt)
				const payload = JSON.parse(decrypted)
				return verify(payload)
			} catch (error: any) {
				throw new BadRequestException(`Failed to decrypt Lark webhook payload: ${error?.message || 'Unknown error'}`)
			}
		}

		return null
	}

	@Post('runtime/:id/start')
	async startRuntime(@Param('id') integrationId: string, @Query('accountId') accountId?: string) {
		const integration = await this.core.integration.findById(integrationId)
		if (!integration) {
			throw new BadRequestException(`Integration ${integrationId} not found`)
		}

		return this.channelRuntimeManager.startAccount(
			'lark',
			integrationId,
			accountId || integration.id
		)
	}

	@Post('runtime/:id/stop')
	async stopRuntime(
		@Param('id') integrationId: string,
		@Query('accountId') accountId?: string,
		@Body() body?: { reason?: string }
	) {
		const integration = await this.core.integration.findById(integrationId)
		if (!integration) {
			throw new BadRequestException(`Integration ${integrationId} not found`)
		}

		const defaultAccountId = accountId || integration.id
		const result = this.channelRuntimeManager.stopAccount(
			'lark',
			integrationId,
			defaultAccountId,
			body?.reason || 'Lark account runtime stopped manually'
		)

		// Backward compatibility: also stop legacy appId-bound runtime if present.
		const legacyAccountId = integration.options?.appId
		if (!accountId && legacyAccountId && legacyAccountId !== defaultAccountId) {
			const legacy = this.channelRuntimeManager.stopAccount(
				'lark',
				integrationId,
				legacyAccountId,
				body?.reason || 'Lark account runtime stopped manually (legacy key)'
			)
			return {
				...result,
				abortedRunIds: Array.from(new Set([...result.abortedRunIds, ...legacy.abortedRunIds]))
			}
		}

		return result
	}

	@Get('runtime/:id/status')
	async runtimeStatus(@Param('id') integrationId: string, @Query('accountId') accountId?: string) {
		const integration = await this.core.integration.findById(integrationId)
		if (!integration) {
			throw new BadRequestException(`Integration ${integrationId} not found`)
		}

		return this.channelRuntimeManager.getAccountStatus(
			'lark',
			integrationId,
			accountId || integration.id
		)
	}

	@Get('runtime/snapshot')
	async runtimeSnapshot() {
		return this.channelRuntimeManager.listRuntimeSnapshot()
	}

	@Post('test')
	async connect(@Body() integration: IIntegration) {
		try {
			const botInfo = await this.larkService.test(integration)
			if (!botInfo) {
				const error = await this.core.i18n.t('integration.Lark.Error_BotPermission', {
					lang: TranslationLanguageMap[RequestContext.getLanguageCode()] || RequestContext.getLanguageCode()
				})
				throw new ForbiddenException(error)
			}
			if (!integration.avatar) {
				integration.avatar = {
					url: botInfo.avatar_url
				}
			}
			return integration
		} catch (err: any) {
			const errorMessage = await this.core.i18n.t('integration.Lark.Error.CredentialsFailed', {
				lang: mapTranslationLanguage(RequestContext.getLanguageCode())
			})
			throw new ForbiddenException(`${errorMessage}: ${err.message}`)
		}
	}

	@Get('chat-select-options')
	async getChatSelectOptions(@Query('integration') id: string) {
		if (!id) {
			throw new BadRequestException(
				await this.core.i18n.t('integration.Lark.Error_SelectAIntegration', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode())
				})
			)
		}
		const client = await this.larkService.getOrCreateLarkClientById(id)
		try {
			const result = await client.im.chat.list()
			const items = result.data.items
			return items.map((item) => ({
				value: item.chat_id,
				label: item.name,
				icon: item.avatar
			}))
		} catch (err: any) {
			if ((<AxiosError>err).response?.data) {
				throw new BadRequestException(err.response.data.msg)
			}
			throw new BadRequestException(err)
		}
	}

	@Get('user-select-options')
	async getUserSelectOptions(@Query('integration') id: string) {
		if (!id) {
			throw new BadRequestException(
				await this.core.i18n.t('integration.Lark.Error_SelectAIntegration', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode())
				})
			)
		}
		const client = await this.larkService.getOrCreateLarkClientById(id)

		try {
			const result = await client.contact.user.list({
				params: {}
			})
			const items = result.data.items

			// Use open_id to match resolveReceiveId() in LarkChannelStrategy
			return items.map((item) => ({
				value: item.open_id,
				label: item.name || item.email || item.mobile,
				icon: item.avatar
			}))
		} catch (err: any) {
			if ((<AxiosError>err).response?.data) {
				throw new BadRequestException(err.response.data.msg)
			}
			throw new BadRequestException(err)
		}
	}
}
