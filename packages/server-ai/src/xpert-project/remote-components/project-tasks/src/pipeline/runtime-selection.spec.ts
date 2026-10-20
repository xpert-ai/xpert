import {
    projectPipelineConfigurationSchema,
    type ProjectPipelineCatalog,
    type ProjectPipelineConfigurationForm
} from '@xpert-ai/contracts'
import { initialRuntimeSelections, runtimeSelectionState } from './runtime-selection'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod/v3'

const source = z
    .object({ template: z.unknown(), binding: z.unknown() })
    .parse(
        JSON.parse(
            readFileSync(
                resolve(
                    __dirname,
                    '../../../../../../../../docs/plans/project-pipeline/code-review-pipeline.proposed.json'
                ),
                'utf8'
            )
        )
    )
const configuration = projectPipelineConfigurationSchema.parse({ schemaVersion: 1, ...source })
const form: ProjectPipelineConfigurationForm = {
    templateRef: configuration.binding.templateRef,
    description: { en_US: 'Runtime' },
    assistantSlots: [],
    runtimeSlots: [{ slot: 'correctness', label: { en_US: 'Check' } }],
    parameters: []
}
const bindingId = '00000000-0000-4000-8000-000000000001',
    workspaceId = '00000000-0000-4000-8000-000000000002'
const catalog: ProjectPipelineCatalog = {
    canManage: true,
    items: [],
    assistants: [],
    runtimeBindings: [
        {
            id: bindingId,
            title: 'Runtime',
            provider: 'neutral',
            revision: '1',
            workspaces: [{ id: workspaceId, name: 'First' }]
        }
    ]
}
const saved = {
    ...configuration,
    binding: {
        ...configuration.binding,
        executorBindings: {
            correctness: {
                kind: 'runtime_binding' as const,
                roleKey: 'correctness',
                selectionKey: bindingId,
                workspaceId
            }
        }
    }
}

it('preserves an unavailable saved binding and workspace so a copy cannot silently change executors', () => {
    const unavailable = { ...catalog, runtimeBindings: [] }
    const copy = initialRuntimeSelections(saved, form, unavailable, true)
    expect(copy.correctness).toEqual({ bindingId, workspaceId })
    expect(runtimeSelectionState(form, copy, unavailable).unavailable).toHaveLength(1)
    expect(initialRuntimeSelections(saved, form, unavailable, false).correctness).toEqual({
        bindingId: '',
        workspaceId: ''
    })
})
it('requires explicit workspace selection for ambiguous legacy bindings', () => {
    const multi = {
        ...catalog,
        runtimeBindings: [
            {
                ...catalog.runtimeBindings![0],
                workspaces: [
                    ...catalog.runtimeBindings![0].workspaces,
                    { id: '00000000-0000-4000-8000-000000000003', name: 'Second' }
                ]
            }
        ]
    }
    const legacy = {
        ...saved,
        binding: {
            ...saved.binding,
            executorBindings: {
                correctness: { kind: 'runtime_binding' as const, roleKey: 'correctness', selectionKey: bindingId }
            }
        }
    }
    const copy = initialRuntimeSelections(legacy, form, multi, true)
    expect(copy.correctness.workspaceId).toBe('')
    expect(runtimeSelectionState(form, copy, multi).incomplete).toBe(true)
    expect(initialRuntimeSelections(legacy, form, catalog, true).correctness.workspaceId).toBe(workspaceId)
})
it('detects workspace revocation without discarding the saved selection', () => {
    const copy = initialRuntimeSelections(saved, form, catalog, true)
    expect(runtimeSelectionState(form, copy, catalog)).toEqual({ unavailable: [], incomplete: false })
    const revoked = { ...catalog, runtimeBindings: [{ ...catalog.runtimeBindings![0], workspaces: [] }] }
    expect(runtimeSelectionState(form, copy, revoked).unavailable).toHaveLength(1)
    expect(copy.correctness.workspaceId).toBe(workspaceId)
})
