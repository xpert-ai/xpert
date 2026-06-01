import { Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'

export type IndicatorToolContext = {
	commandBus?: CommandBus
	logger: Logger
}

export enum IndicatorToolsEnum {
	SWITCH_PROJECT = 'switch_project',
	LIST_INDICATORS = 'list_indicators',
	LIST_CUBES = 'indicator_list_cubes',
	CREATE_DERIVE_INDICATOR = 'create_derive_indicator',
	CREATE_BASIC_INDICATOR = 'create_basic_indicator',
	EDIT_INDICATOR = 'edit_indicator',
	DELETE_INDICATOR = 'delete_indicator',
	INDICATOR_RETRIEVER = 'indicator_retriever',
	SHOW_INDICATORS = 'show_indicators',
	GET_CUBE_CONTEXT = 'get_indicator_cube_context',
	DIMENSION_MEMBER_RETRIEVER = 'dimension_member_retriever'
}
