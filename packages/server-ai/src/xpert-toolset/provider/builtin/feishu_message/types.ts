import { TToolCredentials } from "@metad/contracts";

export enum FeishuToolEnum {
    CREATE_MESSAGE = 'feishu_create_message',
}

export type TFeishuMessageToolCredentials = TToolCredentials & {
    integration: string
    chat?: string
    user?: string
}