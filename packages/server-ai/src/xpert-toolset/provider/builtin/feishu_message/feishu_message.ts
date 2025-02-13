import * as lark from '@larksuiteoapi/node-sdk'
import { IXpertToolset } from '@metad/contracts'
import { GetLarkClientQuery } from '../../../../integration-lark'
import { ToolProviderCredentialValidationError } from '../../../errors'
import { BuiltinTool } from '../builtin-tool'
import { BuiltinToolset, TBuiltinToolsetParams } from '../builtin-toolset'
import { CreateMessageTool } from './tools/create-message'
import { FeishuToolEnum, TFeishuMessageToolCredentials } from './types'

export class FeishuMessageToolset extends BuiltinToolset {
	static provider = 'feishu_message'

    protected _client: lark.Client = null
	constructor(protected toolset?: IXpertToolset, params?: TBuiltinToolsetParams) {
		super(FeishuMessageToolset.provider, toolset, params)
	}

	async initTools(): Promise<BuiltinTool[]> {
		this.tools = []
		if (this.toolset?.tools) {
			const enabledTools = this.toolset?.tools.filter((_) => _.enabled)
			if (enabledTools.some((_) => _.name === FeishuToolEnum.CREATE_MESSAGE)) {
				this.tools.push(new CreateMessageTool(this))
			}
		}

		return this.tools
	}

	getCredentials() {
		return this.toolset.credentials as TFeishuMessageToolCredentials
	}

    async getClient() {
        if (!this._client) {
            const integration = this.toolset.credentials?.integration
            this._client = await this.queryBus.execute(new GetLarkClientQuery(integration))
        }
        return this._client
    }

	async _validateCredentials(credentials: TFeishuMessageToolCredentials) {
		const { integration } = credentials
		if (!integration) {
			throw new ToolProviderCredentialValidationError(`Integration not provided`)
		}

		let client: lark.Client = null
		try {
			client = await this.queryBus.execute(new GetLarkClientQuery(integration))
		} catch (err) {
			throw new ToolProviderCredentialValidationError(`Integration not available`)
		}

		const res = await client.request({
			method: 'GET',
			url: 'https://open.feishu.cn/open-apis/bot/v3/info',
			data: {},
			params: {}
		})

		if (!credentials.chat && !credentials.user) {
			throw new ToolProviderCredentialValidationError(`Configure at least one group or user`)
		}
	}
    
}
