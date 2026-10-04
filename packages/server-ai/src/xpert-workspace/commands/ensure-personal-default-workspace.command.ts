import { Command } from '@nestjs/cqrs'
import type { IXpertWorkspace } from '@xpert-ai/contracts'

/**
 * Prepare the authenticated user's private default workspace in the selected organization.
 * Use for personal Assistant onboarding that must not reuse a shared authoring workspace.
 * The caller serializes first-time creation for the current tenant / organization / user.
 * This operation does not change the user's authoring preference or organization membership.
 */
export class EnsurePersonalDefaultWorkspaceCommand extends Command<IXpertWorkspace> {
    static readonly type = '[Xpert Workspace] Ensure personal default'

    constructor(public readonly name: string) {
        super()
    }
}
