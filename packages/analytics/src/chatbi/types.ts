import { CompiledStateGraph, StateGraphArgs } from '@langchain/langgraph'
import { IChatBIModel } from '@metad/contracts'
import { AgentState, createCopilotAgentState } from '@metad/copilot'
import {
	ChartDimensionSchema,
	ChartMeasureSchema,
	DataSettingsSchema,
	DSCoreService,
	EntityType,
	Indicator,
	OrderBySchema,
	SlicerSchema,
	TimeSlicerSchema,
	VariableSchema
} from '@metad/ocap-core'
import { ChatLarkContext, LarkService } from '@metad/server-ai'
import { Logger } from '@nestjs/common'
import { Cache } from 'cache-manager'
import { z } from 'zod'
import { NgmDSCoreService } from '../model/ocap'
import { ChatBIModelService } from '../chatbi-model'

export const CHATBI_COMMAND_NAME = 'chatbi'
export type ChatBIAgentState = AgentState
export const insightAgentState: StateGraphArgs<ChatBIAgentState>['channels'] = {
	...createCopilotAgentState()
}

export interface IChatBI {
	// endConversation(id: string): void
	getUserConversation(input: ChatBILarkContext): Promise<any>
}

export type ChatBIUserSession = {
	tenantId: string
	organizationId: string
	chatModelId: string
}

export type ChatContext = {
	conversationId?: string
	chatId?: string
	logger: Logger
	dsCoreService?: DSCoreService
	entityType?: EntityType
	larkService?: LarkService
	chatBIService?: IChatBI
	conversation?: IChatBIConversation
}

export type ChatBILarkMessage = {
	type: 'text' | 'interactive'
	data: any
}

export type ChatBILarkContext = ChatLarkContext & {
	userId?: string
	text?: string
}

export type IChatBIConversation = {
	id: string
	graph: CompiledStateGraph<ChatBIAgentState, Partial<ChatBIAgentState>, '__start__' | 'agent' | 'tools'>
	models: IChatBIModel[]

	upsertIndicator(indicator: Indicator): void
	newThread(): void
	destroy(): void
	// answerMessage(data: any): Promise<any>
	getCube(modelId: string, cubeName: string): Promise<EntityType>
	getCubeCache(modelId: string, cubeName: string): Promise<EntityType>
	setCubeCache(modelId: string, cubeName: string, data: any): Promise<void>
	messageWithEndAction(data: any, action?: (action: any) => void): void

	ask(content: string): Promise<void>
	end(): Promise<void>

	continue(elements: any[]): Promise<any>
	done(card: { elements: any[]; header: any }): Promise<any>
	updateMessage(card: { elements: any[]; header?: any; action?: (action) => void }): Promise<any>
}

export const C_CHATBI_END_CONVERSATION = 'chatbi-end-conversation'

export const GetCubesContextSchema = z.object({
	cubes: z.array(
		z.object({
			modelId: z.string().describe('The model id of cube'),
			name: z.string().describe('The name of cube')
		})
	)
})

export const ChatAnswerSchema = z.object({
	preface: z.string().describe('preface of the answer'),
	visualType: z.enum(['Chart', 'Table', 'KPI']).optional().describe('Visual type of result'),
	dataSettings: DataSettingsSchema.optional().describe('The data settings of the widget'),
	chartType: z
		.object({
			type: z.enum(['Column', 'Line', 'Pie', 'Bar']).describe('The type of chart')
		})
		.optional()
		.describe('Chart configuration'),
	dimensions: z.array(ChartDimensionSchema).optional().describe('The dimensions used by the chart'),
	measures: z.array(ChartMeasureSchema).optional().describe('The measures used by the chart'),
	orders: z.array(OrderBySchema).optional().describe('The orders used by the chart'),
	top: z.number().optional().describe('The number of top members'),
	slicers: z.array(SlicerSchema).optional().describe('The slicers to filter data'),
	timeSlicers: z.array(TimeSlicerSchema).optional().describe('The time slicers to filter data'),
	variables: z.array(VariableSchema).optional().describe('The variables to the query of cube')
})


// BI Context
export type TBIContext = {
	dsCoreService: NgmDSCoreService
	modelService: ChatBIModelService
	cacheManager: Cache
}