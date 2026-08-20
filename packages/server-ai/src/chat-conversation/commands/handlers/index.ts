import { CancelSummaryJobHandler } from './cancel-summary.handler'
import { ChatConversationBindXpertHandler } from './bind-xpert.handler'
import { ChatConversationBindProjectHandler } from './bind-project.handler'
import { ChatConversationDeleteHandler } from './conversation-delete.handler'
import { ConvFileDeleteHandler } from './delete-file.handler'
import { ConvFileGetByPathCommandHandler } from './file-get-by-path.handler'
import { ListConvFilesHandler } from './list-files.handler'
import { ScheduleSummaryJobHandler } from './schedule-summary.handler'
import { ConvFileUpsertHandler } from './upsert-file.handler'
import { ChatConversationUpsertHandler } from './upsert.handler'
import { CancelConversationHandler } from './cancel-conversation.handler'

export const CommandHandlers = [
    ChatConversationUpsertHandler,
    ChatConversationBindXpertHandler,
    ChatConversationBindProjectHandler,
    ChatConversationDeleteHandler,
    ScheduleSummaryJobHandler,
    CancelSummaryJobHandler,
    ConvFileGetByPathCommandHandler,
    ConvFileUpsertHandler,
    ConvFileDeleteHandler,
    ListConvFilesHandler,
    CancelConversationHandler
]
