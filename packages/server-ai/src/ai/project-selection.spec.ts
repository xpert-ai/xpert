import type { IChatConversation, IXpert, ProjectSelection, TXpertChatSendRequest } from '@xpert-ai/contracts'
import { clearContextProject, projectSelectionSchema, resolveSendProjectSelection } from './project-selection'

describe('first-send Project intent', () => {
    const conversation = { id: 'conversation-1' } as IChatConversation
    const xpert = { options: { workspaceScope: { mode: 'project-required', onMissing: 'create' } } } as IXpert
    const request = (projectSelection?: ProjectSelection): TXpertChatSendRequest => ({
        action: 'send',
        projectSelection,
        message: { input: { input: 'Outline only' } }
    })

    it.each(['none', 'auto-new'] as const)('does not inherit old context or legacy projectId for %s', (mode) => {
        expect(
            resolveSendProjectSelection(
                { ...request({ mode }), projectId: 'stale-project' },
                conversation,
                xpert,
                'old-context'
            )
        ).toEqual({ selection: { mode } })
    })

    it('uses only the explicitly selected existing Project', () => {
        expect(
            resolveSendProjectSelection(
                request({ mode: 'existing', projectId: 'selected' }),
                conversation,
                xpert,
                'old-context'
            )
        ).toEqual({ projectId: 'selected', selection: { mode: 'existing', projectId: 'selected' } })
    })

    it('reuses the first-send binding on an auto-new retry', () => {
        expect(
            resolveSendProjectSelection(request({ mode: 'auto-new' }), { ...conversation, projectId: 'created' }, xpert)
        ).toEqual({ projectId: 'created', selection: { mode: 'existing', projectId: 'created' } })
    })

    it.each<ProjectSelection>([{ mode: 'none' }, { mode: 'existing', projectId: 'different' }])(
        'rejects moving a bound conversation',
        (selection) => {
            expect(() =>
                resolveSendProjectSelection(request(selection), { ...conversation, projectId: 'original' }, xpert)
            ).toThrow()
        }
    )

    it('preserves an explicit no-Project conversation after reload even if the Assistant now defaults to auto-new', () => {
        const personal = { ...conversation, options: { projectSelection: { mode: 'none' as const } } }
        expect(resolveSendProjectSelection(request({ mode: 'auto-new' }), personal, xpert, 'old-context')).toEqual({
            selection: { mode: 'none' }
        })
    })

    it('rejects auto creation for an Assistant that did not opt in', () => {
        expect(() =>
            resolveSendProjectSelection(request({ mode: 'auto-new' }), conversation, { id: 'assistant' } as IXpert)
        ).toThrow()
    })

    it('preserves legacy context fallback only when intent is absent', () => {
        expect(resolveSendProjectSelection(request(), conversation, xpert, 'legacy')).toEqual({ projectId: 'legacy' })
    })

    it('validates the discriminator and clears stale standard context fields', () => {
        expect(projectSelectionSchema.safeParse({ mode: 'existing' }).success).toBe(false)
        expect(projectSelectionSchema.safeParse({ mode: 'none', projectId: 'hidden' }).success).toBe(false)
        expect(
            clearContextProject({
                projectId: 'old',
                env: { projectId: 'old', workspaceId: 'workspace' },
                selectedText: 'keep'
            })
        ).toEqual({ env: { workspaceId: 'workspace' }, selectedText: 'keep' })
    })
})
