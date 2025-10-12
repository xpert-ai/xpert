import { IIntegration } from "@metad/contracts";
import * as lark from '@larksuiteoapi/node-sdk'

export class LarkClient {
    private client: lark.Client;
    constructor(private readonly integration: IIntegration) {
        this.client = new lark.Client({
                    appId: integration.options.appId,
                    appSecret: integration.options.appSecret,
                    appType: lark.AppType.SelfBuild,
                    domain: integration.options.isLark ? lark.Domain.Lark : lark.Domain.Feishu,
                    loggerLevel: lark.LoggerLevel.debug
                })
    }

    async getBotInfo() {
        const res = await this.client.request({
            method: 'GET',
            url: 'https://open.feishu.cn/open-apis/bot/v3/info',
            data: {},
            params: {}
        })

        return res.bot
    }
}