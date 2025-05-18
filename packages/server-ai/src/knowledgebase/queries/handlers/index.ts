import { KnowledgebaseGetOneHandler } from "./get-one.handler";
import { KnowledgeSearchQueryHandler } from "./knowledge.handler";
import { StatisticsKnowledgebasesHandler } from "./statistics-knowledgebases.handler";

export const QueryHandlers = [
	KnowledgeSearchQueryHandler,
	KnowledgebaseGetOneHandler,
	StatisticsKnowledgebasesHandler
];
