import { Command } from '@nestjs/cqrs'
import type { TResolvedSkillRef, TWorkspaceDefaultSkillRef } from '../template.types'

/**
 * Resolves template skill references against repositories visible in the current trusted request scope.
 * Use for workspace bootstrap and template skill validation. This resolves references only;
 * callers still authorize and perform any installation or modification.
 */
export class ResolveTemplateSkillRefsCommand extends Command<TResolvedSkillRef[]> {
    static readonly type = '[Xpert Template] Resolve skill references'

    constructor(public readonly refs: TWorkspaceDefaultSkillRef[]) {
        super()
    }
}
