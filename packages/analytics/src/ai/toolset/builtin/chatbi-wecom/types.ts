import { IChatBIModel } from '@metad/contracts'
import { ChatBIContext } from '../chatbi/types'

export type ChatBIWeComContext = ChatBIContext & {
	models?: IChatBIModel[]
}

export enum ChatBIWeComToolsEnum {
	WELCOME = 'welcome',
}

export const TABLE_PAGE_SIZE = 10