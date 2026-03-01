import axios from 'axios'
import { existsSync } from 'node:fs'
import path from 'node:path'
import * as dotenv from 'dotenv'
import { AGENT_CHAT_DISPATCH_MESSAGE_TYPE } from '@xpert-ai/plugin-sdk'

const customEnvPath = process.env.INTEGRATION_LARK_E2E_ENV_PATH
const defaultEnvPath = path.resolve(process.cwd(), 'packages/plugins/integration-lark/.env.e2e.local')
const fallbackEnvPath = path.resolve(process.cwd(), '.env')
const resolvedEnvPath = customEnvPath ?? (existsSync(defaultEnvPath) ? defaultEnvPath : fallbackEnvPath)
console.log(`Using environment variables from: ${resolvedEnvPath}`)
dotenv.config({ path: resolvedEnvPath })

const e2eEnabled = process.env.INTEGRATION_LARK_HANDOFF_E2E_ENABLED === 'true'
const describeWithE2E = e2eEnabled ? describe : describe.skip

const e2eBaseUrl = process.env.INTEGRATION_LARK_E2E_BASE_URL || 'http://localhost:3000/api'
const e2eTimeoutMs = Number(process.env.INTEGRATION_LARK_E2E_TIMEOUT_MS || 30000)

describeWithE2E('Integration Lark handoff callback channel (real e2e)', () => {
	it(
		'should call /lark/e2e/handoff/chat and get accepted response',
		async () => {
			const requiredEnv: Array<[string, string | undefined]> = [
				['INTEGRATION_LARK_E2E_TENANT_ID', process.env.INTEGRATION_LARK_E2E_TENANT_ID ?? process.env.E2E_TENANT_ID],
				['INTEGRATION_LARK_E2E_USER_ID', process.env.INTEGRATION_LARK_E2E_USER_ID ?? process.env.E2E_USER_ID],
				['INTEGRATION_LARK_E2E_INTEGRATION_ID', process.env.INTEGRATION_LARK_E2E_INTEGRATION_ID],
				['INTEGRATION_LARK_E2E_CHAT_ID', process.env.INTEGRATION_LARK_E2E_CHAT_ID],
				['INTEGRATION_LARK_E2E_XPERT_ID', process.env.INTEGRATION_LARK_E2E_XPERT_ID]
			]
			const missing = requiredEnv.filter(([, value]) => !value).map(([name]) => name)
			if (missing.length) {
				throw new Error(`Missing required env for integration-lark e2e: ${missing.join(', ')}`)
			}

			const tenantId =
				process.env.INTEGRATION_LARK_E2E_TENANT_ID ?? process.env.E2E_TENANT_ID ?? 'e2e-tenant'
			const userId = process.env.INTEGRATION_LARK_E2E_USER_ID ?? process.env.E2E_USER_ID ?? 'e2e-user'
			const organizationId =
				process.env.INTEGRATION_LARK_E2E_ORGANIZATION_ID ?? process.env.E2E_ORGANIZATION_ID

			try {
				const response = await axios.post(
					`${e2eBaseUrl}/lark/e2e/handoff/chat`,
					{
						tenantId,
						organizationId,
						userId,
						integrationId: process.env.INTEGRATION_LARK_E2E_INTEGRATION_ID,
						chatId: process.env.INTEGRATION_LARK_E2E_CHAT_ID,
					senderOpenId: process.env.INTEGRATION_LARK_E2E_SENDER_OPEN_ID,
					xpertId: process.env.INTEGRATION_LARK_E2E_XPERT_ID,
					input: process.env.INTEGRATION_LARK_E2E_INPUT ?? 'Hello from integration-lark e2e',
					language: process.env.INTEGRATION_LARK_E2E_LANGUAGE,
					mockLarkUpdate: process.env.INTEGRATION_LARK_E2E_MOCK_LARK_UPDATE !== 'false',
					message: {
						id: process.env.INTEGRATION_LARK_E2E_LARK_MESSAGE_ID
					}
				},
					{
						timeout: e2eTimeoutMs,
						headers: {
							...(process.env.INTEGRATION_LARK_E2E_API_KEY
								? { 'x-e2e-key': process.env.INTEGRATION_LARK_E2E_API_KEY }
								: {})
						}
					}
				)

				expect(response.status).toBe(200)
				expect(response.data?.accepted).toBe(true)
				expect(response.data?.messageType).toBe(AGENT_CHAT_DISPATCH_MESSAGE_TYPE)
				expect(response.data?.larkMessage).toBeDefined()
			} catch (error: any) {
				console.error(error.response?.data || error)
				throw error
			}
		},
		e2eTimeoutMs + 5000
	)
})
