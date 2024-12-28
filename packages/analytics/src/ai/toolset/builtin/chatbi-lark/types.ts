import { IChatBIModel } from '@metad/contracts'
import { ChatBIContext } from '../chatbi/types'

export type ChatBILarkContext = ChatBIContext & {
	models?: IChatBIModel[]
}

export enum ChatBILarkToolsEnum {
	WELCOME = 'welcome',
}

export const TABLE_PAGE_SIZE = 10