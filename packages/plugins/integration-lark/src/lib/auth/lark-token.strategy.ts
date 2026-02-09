import * as lark from '@larksuiteoapi/node-sdk'
import { IIntegration, TIntegrationLarkOptions } from '@metad/contracts'
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import express from 'express'
import { Strategy } from 'passport'
import { LarkService } from '../lark.service'
import { LarkCoreApi } from '../lark-core-api.service'

@Injectable()
export class LarkTokenStrategy extends PassportStrategy(Strategy, 'lark-token') {
	validate(...args: any[]): unknown {
		throw new Error('Method not implemented.')
	}
	readonly logger = new Logger(LarkTokenStrategy.name)

	constructor(
		private readonly larkService: LarkService,
		private readonly core: LarkCoreApi
	) {
		super()
	}

	authenticate(req: express.Request, options: { session: boolean; property: string }) {
		const integrationId = req.params.id
		let data = req.body

		this.logger.verbose(`Lark request body:`, data)
		;(async () => {
			try {
				const integration: IIntegration<TIntegrationLarkOptions> =
					await this.core.integration.findById(integrationId, { relations: ['tenant'] })
				if (!integration) {
					throw new Error(`Integration ${integrationId} not found`)
				}
				req.headers['organization-id'] = integration.organizationId

				if (data.encrypt) {
					const encryptKey = integration.options.encryptKey
					if (!encryptKey) {
						throw new Error(`You need to configure the encrypt Key for Feishu (Lark)`)
					}
					data = new lark.AESCipher(encryptKey).decrypt(data.encrypt)
					data = JSON.parse(data)
				}

				if (data.type === 'url_verification') {
					this.success({})
				} else {
					const integrationClient = this.larkService.getOrCreateLarkClient(integration)
					let union_id = null
					switch (data.header?.event_type) {
						case 'card.action.trigger': {
							union_id = data.event.operator?.union_id
							break
						}
						case 'im.message.receive_v1': {
							union_id = data.event.sender?.sender_id.union_id
							break
						}
					}

					if (!union_id) {
						throw new Error(`Can't get union_id from event of lark message`)
					}

					const user = await this.larkService.getUser(
						integrationClient.client,
						integration.tenantId,
						union_id
					)

					// Set language header
					req.headers['language'] = integration.options?.preferLanguage || user.preferredLanguage
					this.success(user)
				}
			} catch (err) {
				this.logger.error(err, integrationId, data)
				this.fail(new UnauthorizedException('Invalid user', err.message))
			}
		})()
	}
}
