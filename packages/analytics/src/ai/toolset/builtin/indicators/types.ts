import { Logger } from "@nestjs/common"
import { CommandBus } from "@nestjs/cqrs"

export type IndicatorToolContext = {
    commandBus?: CommandBus;
    logger: Logger,
}

export enum IndicatorToolsEnum {
    CREATE_INDICATOR = 'create_indicator',
    INDICATOR_RETRIEVER = 'indicator_retriever',
    KNOWLEDGE_RETRIEVER = 'knowledge_retriever',
}