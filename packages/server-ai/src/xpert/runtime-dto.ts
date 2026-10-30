import { IXpert } from '@xpert-ai/contracts'

/** Runtime presentation only. Graphs, prompts, provider bindings and template lineage stay server-side. */
export function appUserRuntimeAssistant(xpert: IXpert): Partial<IXpert> {
    return {
        id: xpert.id, slug: xpert.slug, name: xpert.name, title: xpert.title,
        description: xpert.description, avatar: xpert.avatar, type: xpert.type,
        latest: xpert.latest, publishAt: xpert.publishAt,
        options: {
            workspaceScope: xpert.options?.workspaceScope,
            workbench: xpert.options?.workbench
        }
    }
}
