import { KnowledgebaseGetOneHandler } from "./get-one.handler";
import { KnowledgeSearchQueryHandler } from "./knowledge-search.handler";
import { StatisticsKnowledgebasesHandler } from "./statistics-knowledgebases.handler";
import { KnowledgeStrategyHandler } from "./strategy.handler";
import { KnowledgeTaskServiceHandler } from "./task-service.handler";

export const QueryHandlers = [
	KnowledgeSearchQueryHandler,
	KnowledgebaseGetOneHandler,
	StatisticsKnowledgebasesHandler,
	KnowledgeStrategyHandler,
	KnowledgeTaskServiceHandler
];
