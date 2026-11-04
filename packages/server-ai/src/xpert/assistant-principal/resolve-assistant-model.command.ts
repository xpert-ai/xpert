import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { DataSource } from 'typeorm'
import { Xpert } from '../xpert.entity'
import { assistantModelCandidates } from '../assistant-model-selection.util'
import { AssistantPrincipalAccessService, assistantPrincipalDenied } from './assistant-principal-access.service'

/** Confirms a published model binding for the Assistant principal; provider policy remains with model access. */
export class ResolveAssistantModelCommand extends Command<boolean> {
    constructor(
        readonly actor: { tenantId: string; organizationId: string; userId: string },
        readonly assistantId: string,
        readonly model: { copilotId: string; model: string; modelType: AiModelTypeEnum }
    ) {
        super()
    }
}

@CommandHandler(ResolveAssistantModelCommand)
export class ResolveAssistantModelHandler implements ICommandHandler<ResolveAssistantModelCommand> {
    constructor(
        @Inject(AssistantPrincipalAccessService)
        private readonly access: Pick<AssistantPrincipalAccessService, 'isPrincipal' | 'find'>,
        private readonly database: DataSource
    ) {}

    async execute({ actor, assistantId, model }: ResolveAssistantModelCommand) {
        if (!(await this.access.isPrincipal(actor))) return false
        if (!(await this.access.find(actor, { assistantId }))) throw assistantPrincipalDenied()
        const assistant = await this.database.getRepository(Xpert).findOne({
            where: { id: assistantId, tenantId: actor.tenantId, organizationId: actor.organizationId },
            relations: ['agent', 'agent.copilotModel', 'copilotModel', 'agents', 'agents.copilotModel']
        })
        if (!assistant?.active || !assistant.publishAt) throw assistantPrincipalDenied()
        const models = [
            ...assistantModelCandidates(assistant).map((item) => item.model),
            ...(assistant.agents ?? []).map((agent) => agent.copilotModel).filter(Boolean)
        ]
        if (
            !models.some(
                (candidate) =>
                    candidate.copilotId === model.copilotId &&
                    candidate.model === model.model &&
                    (candidate.modelType ?? AiModelTypeEnum.LLM) === model.modelType
            )
        )
            throw assistantPrincipalDenied()
        return true
    }
}
