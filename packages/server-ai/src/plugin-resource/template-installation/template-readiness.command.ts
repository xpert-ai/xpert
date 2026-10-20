import { Command } from '@nestjs/cqrs'
import type { TemplateReadiness, TXpertTemplate } from '@xpert-ai/contracts'

export class ReconcileTemplateSkillReferencesCommand extends Command<import('@xpert-ai/contracts').TXpertTeamDraft> {
    constructor(
        readonly assistant: import('@xpert-ai/contracts').IXpert,
        readonly draft: import('@xpert-ai/contracts').TXpertTeamDraft,
        readonly before: import('@xpert-ai/contracts').TemplateDependencyLock[],
        readonly after: import('@xpert-ai/contracts').TemplateDependencyLock[]
    ) {
        super()
    }
}

/** Inspect requirements in the current organization; returns only public installation metadata. */
export class InspectTemplateReadinessCommand extends Command<TemplateReadiness> {
    constructor(
        readonly template: TXpertTemplate,
        readonly workspaceId?: string
    ) {
        super()
    }
}

/** Check runtime availability and explicit requirements; ordinary drift returns update recommendations. */
export class AssertAssistantTemplateDependenciesCommand extends Command<
    import('@xpert-ai/contracts').TemplateRuntimeDependencyReport
> {
    constructor(
        readonly assistantId: string,
        readonly entry: 'runtime' | 'authoring'
    ) {
        super()
    }
}

/** Internal import preparation uses the same normalization and dependency resolution as marketplace installation. */
export class PrepareAssistantDefinitionCommand extends Command<{
    definition: import('@xpert-ai/contracts').AssistantTemplateDefinition
    locks: import('@xpert-ai/contracts').TemplateDependencyLock[]
}> {
    constructor(
        readonly template: TXpertTemplate,
        readonly workspaceId: string
    ) {
        super()
    }
}
export class InstallAssistantDefinitionDependenciesCommand extends Command<void> {
    constructor(
        readonly template: TXpertTemplate,
        readonly assistant: import('@xpert-ai/contracts').IXpert,
        readonly locks: import('@xpert-ai/contracts').TemplateDependencyLock[]
    ) {
        super()
    }
}
