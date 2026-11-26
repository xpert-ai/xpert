import type { LanguagesEnum, IXpert, TXpertTeamDraft } from '@xpert-ai/contracts'

/** Recompose an installed selection on a replacement base draft before the authorized import writes it. */
export class RecomposeAssistantCapabilitiesQuery {
    constructor(
        public readonly installed: IXpert,
        public readonly incoming: TXpertTeamDraft,
        public readonly language: LanguagesEnum,
        public readonly sandboxProviders: { type: string }[]
    ) {}
}
