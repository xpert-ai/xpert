import { KnowledgebaseGetOneHandler } from "./get-one.handler";
import { KnowledgeSearchQueryHandler } from "./knowledge-search.handler";
import { StatisticsKnowledgebasesHandler } from "./statistics-knowledgebases.handler";

export const QueryHandlers = [
	KnowledgeSearchQueryHandler,
	KnowledgebaseGetOneHandler,
	StatisticsKnowledgebasesHandler
];
