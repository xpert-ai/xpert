import { Logger } from "@nestjs/common"

export type IndicatorToolContext = {
    logger: Logger,
    conversation
}

export enum IndicatorToolsEnum {
    CREATE_INDICATOR = 'create_indicator',
    KNOWLEDGE_RETRIEVER = 'knowledge_retriever',
}