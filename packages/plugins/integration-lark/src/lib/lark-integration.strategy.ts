import { Injectable, Logger } from '@nestjs/common'
import { IIntegration, IntegrationEnum, IntegrationLarkProvider, TIntegrationLarkOptions, TIntegrationProvider } from '@metad/contracts'
import { IntegrationStrategy, IntegrationStrategyKey, TIntegrationStrategyParams } from '@xpert-ai/plugin-sdk'
import axios, { AxiosError } from 'axios'

/**
 * Lark Integration Strategy
 *
 * Implements IntegrationStrategy for Lark (Feishu) platform.
 * This strategy is used for:
 * - Validating Lark integration configuration
 * - Testing Lark API connection
 * - Providing integration metadata
 *
 * Note: For chat channel operations (sending/receiving messages),
 * use LarkChannelStrategy instead.
 */
@Injectable()
@IntegrationStrategyKey(IntegrationEnum.LARK)
export class LarkIntegrationStrategy implements IntegrationStrategy<TIntegrationLarkOptions> {
	private readonly logger = new Logger(LarkIntegrationStrategy.name)

	/**
	 * Integration metadata - use the existing IntegrationLarkProvider from contracts
	 */
	meta: TIntegrationProvider = IntegrationLarkProvider

	/**
	 * Execute integration action (not used for Lark, but required by interface)
	 */
	async execute(integration: IIntegration<TIntegrationLarkOptions>, payload: TIntegrationStrategyParams): Promise<any> {
		// Lark integration doesn't have a generic execute action
		// Chat operations are handled by LarkChannelStrategy
		return null
	}

	/**
	 * Validate Lark integration configuration
	 *
	 * This method is called when user clicks "Test" button in the UI.
	 * It validates the configuration and tests the actual Lark API connection.
	 *
	 * @param config - Lark configuration options
	 * @throws Error if configuration is invalid or connection fails
	 */
	async validateConfig(config: TIntegrationLarkOptions): Promise<void> {
		// Validate required fields
		if (!config?.appId) {
			throw new Error('App ID is required')
		}

		if (!config?.appSecret) {
			throw new Error('App Secret is required')
		}

		// Test actual connection to Lark API
		try {
			const baseUrl = config.isLark ? 'https://open.larksuite.com' : 'https://open.feishu.cn'

			/**
			 * Do a direct token request to avoid SDK-level token cache causing false-positive tests
			 * when appSecret is changed but appId remains the same.
			 */
			const tokenResponse = await axios.post(
				`${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
				{
					app_id: config.appId,
					app_secret: config.appSecret
				},
				{
					headers: { 'Content-Type': 'application/json' },
					timeout: 10000
				}
			)

			const tokenData = tokenResponse?.data
			if (tokenData?.code !== 0 || !tokenData?.tenant_access_token) {
				throw new Error(tokenData?.msg || 'Failed to get tenant access token from Lark API')
			}

			const botInfoResponse = await axios.get(`${baseUrl}/open-apis/bot/v3/info`, {
				headers: {
					Authorization: `Bearer ${tokenData.tenant_access_token}`
				},
				timeout: 10000
			})

			const botInfo = botInfoResponse?.data
			if (botInfo?.code !== 0 || !botInfo?.bot?.open_id) {
				throw new Error('Failed to get bot info from Lark API')
			}

			this.logger.log(`Lark connection test successful: ${botInfo.bot.app_name}`)
		} catch (error: any) {
			const axiosError = error as AxiosError<{ code?: number; msg?: string }>
			const message = axiosError?.response?.data?.msg || axiosError?.message || 'Unknown error'
			this.logger.error('Lark connection test failed:', error)
			throw new Error(`Lark API connection failed: ${message}`)
		}
	}
}
