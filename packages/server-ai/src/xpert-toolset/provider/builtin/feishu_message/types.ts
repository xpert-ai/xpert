import { TToolCredentials } from "@metad/contracts";

/**
 * @deprecated use lark plugin instead
 */
export enum FeishuToolEnum {
    CREATE_MESSAGE = 'feishu_create_message',
}

/**
 * @deprecated use lark plugin instead
 */
export type TFeishuMessageToolCredentials = TToolCredentials & {
    integration: string
    chat?: string
    user?: string
}