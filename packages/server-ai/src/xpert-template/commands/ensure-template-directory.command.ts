import { Command } from '@nestjs/cqrs'

/**
 * Makes the configured template asset directory ready for platform operations.
 * Use before reading or writing local template assets; this does not authorize access
 * to Assistants or change the caller's tenant and organization scope.
 */
export class EnsureTemplateDirectoryCommand extends Command<string> {
    static readonly type = '[Xpert Template] Ensure directory'
}
