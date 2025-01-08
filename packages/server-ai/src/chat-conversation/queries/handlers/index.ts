import { FindChatConversationHandler } from "./conversation-find.handler";
import { GetChatConversationHandler } from "./conversation-get.handler";
import { StatisticsDailyConvHandler } from "./statistics-daily-conv.handler";
import { StatisticsDailyEndUsersHandler } from "./statistics-daily-end-users.handler";
import { StatisticsAverageSessionInteractionsHandler } from "./statistics-average-session-interactions.handler";
import { StatisticsDailyMessagesHandler } from "./statistics-daily-messages.handler";

export const QueryHandlers = [
	GetChatConversationHandler,
	FindChatConversationHandler,
	StatisticsDailyConvHandler,
	StatisticsDailyEndUsersHandler,
	StatisticsAverageSessionInteractionsHandler,
	StatisticsDailyMessagesHandler
];
