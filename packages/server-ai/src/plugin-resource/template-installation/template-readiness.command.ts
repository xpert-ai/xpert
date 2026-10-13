import { Command } from '@nestjs/cqrs'
import type { TemplateReadiness, TXpertTemplate } from '@xpert-ai/contracts'

/** Inspect requirements in the current organization; returns only public installation metadata. */
export class InspectTemplateReadinessCommand extends Command<TemplateReadiness> {
    constructor(
        readonly template: TXpertTemplate,
        readonly workspaceId?: string
    ) {
        super()
    }
}

/** Revalidate installed dependency locks before execution, using the Assistant's file authority. */
export class AssertAssistantTemplateDependenciesCommand extends Command<void> {
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
