import { IntegrationEnum } from '@metad/contracts'
import { Public } from '@metad/server-auth'
import { ConfigService } from '@metad/server-config'
import {
	decryptSecret,
	encryptSecret,
	EventNameIntegrationAuthorized,
	IntegrationAuthorizedEvent,
	IntegrationService
} from '@metad/server-core'
import { Controller, Get, NotFoundException, Param, Query, Req, Res, UseGuards } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Request, Response } from 'express'
import { GithubService } from './github.service'
import { IntegrationGitHubGuard } from './guards'

@Controller()
export class GithubController {
	constructor(
		private integrationService: IntegrationService,
		private githubService: GithubService,
		private configService: ConfigService,
		private eventEmitter: EventEmitter2
	) {}

	@Public()
	@UseGuards(IntegrationGitHubGuard)
	@Get(':id/login')
	async login(@Param('id') integrationId: string, @Res() res: Response, @Query() query: Record<string, any>) {
		const integration = await this.integrationService.findOne(integrationId)
		const { clientId } = integration.options || {}

		if (!clientId) {
			throw new NotFoundException('GitHub App configuration missing')
		}

		const redirectUri = this.configService.get('baseUrl') + '/api/github/' + integrationId + '/callback'
		// Store query info in state (encrypted)
		const queryString = JSON.stringify(query ?? {})
		const encryptionKey = this.configService.get<string>('secretsEncryptionKey')
		const state = encryptSecret(queryString, encryptionKey)

		const authUrl = new URL('https://github.com/login/oauth/authorize')
		authUrl.searchParams.set('client_id', clientId)
		authUrl.searchParams.set('redirect_uri', redirectUri)
		authUrl.searchParams.set('allow_signup', 'true')
		authUrl.searchParams.set('state', state)

		// Set state in cookie (using response object from Express)
		if (res) {
			res.cookie('GITHUB_AUTH_STATE_COOKIE', state, {
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: 60 * 10,
				path: '/'
			})
		}

		// Redirect to GitHub authorization URL
		if (res) {
			res.redirect(authUrl.toString())
			return
		}
	}

	@Public()
	@UseGuards(IntegrationGitHubGuard)
	@Get(':id/callback')
	async callback(@Param('id') integrationId: string, @Req() req: Request, @Res() res: Response) {
		try {
			const { code, state, error, installation_id } = req.query as Record<string, string>
			const GITHUB_AUTH_STATE_COOKIE = 'GITHUB_AUTH_STATE_COOKIE'

			// Handle GitHub App errors
			if (error) {
				return res.redirect(`/?error=${encodeURIComponent(error)}`)
			}

			// Validate required parameters
			if (!code) {
				return res.redirect('/?error=missing_code_parameter')
			}

			// Verify state parameter to prevent CSRF attacks
			const storedState = req.cookies?.[GITHUB_AUTH_STATE_COOKIE]
			if (storedState && state !== storedState) {
				return res.redirect('/?error=invalid_state')
			}

			// Get integration config
			const integration = await this.integrationService.findOne(integrationId)
			const { clientId, clientSecret } = integration.options || {}
			const redirectUri = this.configService.get('baseUrl') + '/api/github/' + integrationId + '/callback'

			if (!clientId || !clientSecret || !redirectUri) {
				return res.redirect('/?error=configuration_missing')
			}

			// Exchange authorization code for access token
			const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					client_id: clientId,
					client_secret: clientSecret,
					code,
					redirect_uri: redirectUri
				})
			})

			if (!tokenResponse.ok) {
				console.error('Token exchange failed:', await tokenResponse.text())
				return res.redirect('/?error=token_exchange_failed')
			}

			const tokenData = await tokenResponse.json()
			if (tokenData.error) {
				return res.redirect(`/?error=${encodeURIComponent(tokenData.error)}`)
			}

			const queryString = decryptSecret(state, this.configService.get<string>('secretsEncryptionKey'))
			let query = null
			try {
				query = JSON.parse(queryString)
				console.log('Query from state:', query)
			} catch (e) {
				// console.error('Failed to parse query from state:', e)
			}
			this.eventEmitter.emit(
				EventNameIntegrationAuthorized,
				new IntegrationAuthorizedEvent({
					...(query ?? {}),
					provider: integration.provider,
					integrationId: integration.id,
					state: queryString,
					installation_id,
					...tokenData
				})
			)

			// Redirect to chat page
			return res.redirect(query?.redirectUri || this.configService.get('clientBaseUrl'))
		} catch (err) {
			console.error('GitHub App callback error:', err)
			return res.redirect('/?error=callback_failed')
		}
	}

	@Public()
	@Get(':id/installation-callback')
	async installation(
		@Param('id') integrationId: string,
		@Req() req: Request,
		@Res() res: Response,
		@Query('installation_id') installation_id: string,
		@Query('custom_state') custom_state: string
	) {
		try {
			const queryString = decryptSecret(custom_state, this.configService.get<string>('secretsEncryptionKey'))
			let query = null
			try {
				query = JSON.parse(queryString)
				console.log('Query from state:', query)
			} catch (e) {
				// console.error('Failed to parse query from state:', e)
			}

			this.eventEmitter.emit(
				EventNameIntegrationAuthorized,
				new IntegrationAuthorizedEvent({
					...(query ?? {}),
					provider: IntegrationEnum.GITHUB,
					integrationId,
					installationId: installation_id
				})
			)

			// Redirect to chat page
			return res.redirect(query?.redirectUri || this.configService.get('clientBaseUrl'))
		} catch (err) {
			console.error('GitHub App callback error:', err)
			return res.redirect('/?error=callback_failed')
		}
	}

	// @Post('webhook/:integrationId')
	// async handleWebhook(@Param('integrationId') integrationId: string, @Req() req: Request, @Body() body: any) {
	// 	const app = this.githubService.getApp(integrationId)
	// 	// 验证签名，使用 app.webhookSecret 或类似
	// 	// 处理事件
	// 	console.log(`Webhook for integration ${integrationId}:`, body)
	// 	return { status: 'ok' }
	// }

	// 其他端点，如创建集成
	@Get(':id/repositories')
	async getRepositories(
		@Param('id') integrationId: string,
		@Query('installationId') installationId: string,
		@Query('page') page: string,
		@Query('perPage') perPage: string
	) {
		return this.githubService.getRepositories(
			integrationId,
			installationId,
			parseInt(page, 10) || 1,
			parseInt(perPage, 10) || 30
		)
	}
}
