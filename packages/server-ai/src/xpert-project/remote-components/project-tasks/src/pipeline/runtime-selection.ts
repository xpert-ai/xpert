import type {
    ProjectPipelineCatalog,
    ProjectPipelineConfiguration,
    ProjectPipelineConfigurationForm,
    ProjectPipelineRuntimeSelection
} from '@xpert-ai/contracts'

export function initialRuntimeSelections(
    configuration: ProjectPipelineConfiguration,
    form: ProjectPipelineConfigurationForm,
    catalog: ProjectPipelineCatalog,
    copy: boolean
): Record<string, ProjectPipelineRuntimeSelection> {
    return Object.fromEntries(
        (form.runtimeSlots ?? []).map((field) => {
            const executor = configuration.binding.executorBindings?.[field.slot]
            const candidate = catalog.runtimeBindings?.find((item) => item.id === executor?.selectionKey)
            return [
                field.slot,
                {
                    bindingId: copy ? (executor?.selectionKey ?? '') : (candidate?.id ?? ''),
                    workspaceId:
                        (copy
                            ? executor?.workspaceId
                            : candidate?.workspaces.some((item) => item.id === executor?.workspaceId)
                              ? executor?.workspaceId
                              : undefined) ?? (candidate?.workspaces.length === 1 ? candidate.workspaces[0].id : '')
                }
            ]
        })
    )
}

export function runtimeSelectionState(
    form: ProjectPipelineConfigurationForm,
    selections: Record<string, ProjectPipelineRuntimeSelection>,
    catalog: ProjectPipelineCatalog
) {
    const unavailable = (form.runtimeSlots ?? []).filter((field) => {
        const selection = selections[field.slot],
            candidate = catalog.runtimeBindings?.find((item) => item.id === selection?.bindingId)
        return (
            selection?.bindingId &&
            (!candidate ||
                (selection.workspaceId && !candidate.workspaces.some((item) => item.id === selection.workspaceId)))
        )
    })
    return {
        unavailable,
        incomplete: (form.runtimeSlots ?? []).some(
            (field) => !selections[field.slot]?.bindingId || !selections[field.slot]?.workspaceId
        )
    }
}
