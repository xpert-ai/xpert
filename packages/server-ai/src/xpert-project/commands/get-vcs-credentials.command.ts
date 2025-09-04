import { ICommand } from '@nestjs/cqrs'

/**
 * Get project vcs credentials
 */
export class GetVcsCredentialsCommand implements ICommand {
    static readonly type = '[Xpert Project] Get VCS Credentials'

    constructor(
        public readonly projectId: string,
    ) {}
}
