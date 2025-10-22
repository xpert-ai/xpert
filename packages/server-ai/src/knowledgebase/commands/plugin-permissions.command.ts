import { ICommand } from '@nestjs/cqrs';
import { Permissions } from '@xpert-ai/plugin-sdk';

export class PluginPermissionsCommand implements ICommand {
    static readonly type = '[Knowledgebase] Fill plugin permissions';

    constructor(
        public readonly permissions: Permissions,
        public readonly context: {
            knowledgebaseId: string;
            integrationId: string;
            folder?: string;
        }
    ) {}
}
