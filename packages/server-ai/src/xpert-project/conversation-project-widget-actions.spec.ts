import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { AIPermissionsEnum, SecretTokenBindingType } from '@xpert-ai/contracts'
import { ProjectMoveActions } from './conversation-project-widget-actions'
import type { XpertProjectFeatureGuard, XpertProjectPermissionGuard } from './guards'
import { ConversationProjectMoveService } from './services/conversation-project-move'

const identity = { threadId: 'thread', messageId: 'reply', widgetId: 'receipt' }
const offer = { requestId: 'receipt', threadId: 'thread', assistantMessageId: 'reply', conversationId: 'conversation' }
const moves = { pending: jest.fn(), confirm: jest.fn(), dismiss: jest.fn() }
const feature = { canActivate: jest.fn() }
const permissions = { assertPermission: jest.fn() }
const dependencies = [
    moves as unknown as ConversationProjectMoveService,
    feature as unknown as XpertProjectFeatureGuard,
    permissions as unknown as XpertProjectPermissionGuard
] as const
const { confirm, cancel } = new ProjectMoveActions(...dependencies).actions
afterEach(() => jest.restoreAllMocks())

beforeEach(() => {
    jest.resetAllMocks()
    moves.pending.mockResolvedValue(offer)
})

it.each([
    ['existing', { mode: 'existing', projectId: 'Sales' }],
    ['create', { mode: 'create', name: 'Sales' }]
])('confirms %s using the identity from the server receipt', async (mode, target) => {
    const input = { mode, target: ' Sales ', conversationId: 'different' }
    await expect(confirm.execute({ ...identity, fields: input })).resolves.toEqual({ refresh: 'thread' })
    expect(moves.confirm).toHaveBeenCalledWith({
        threadId: 'thread',
        requestId: 'receipt',
        moveFromConversationId: 'conversation',
        shareHistory: true,
        target
    })
})

it('dismisses only the matching pending card', async () => {
    await expect(cancel.execute({ ...identity, fields: {} })).resolves.toEqual({ refresh: 'thread' })
    expect(moves.dismiss).toHaveBeenCalledWith('thread', 'receipt')
    moves.pending.mockResolvedValue(null)
    await expect(cancel.execute({ ...identity, fields: {} })).resolves.toEqual({ refresh: 'thread' })
    moves.pending.mockResolvedValue({ ...offer, projectId: 'moved' })
    await expect(cancel.execute({ ...identity, fields: {} })).rejects.toBeInstanceOf(ConflictException)
    expect(moves.dismiss).toHaveBeenCalledTimes(1)
})

it.each([
    { ...identity, messageId: 'other' },
    { ...identity, widgetId: 'other' }
])('rejects a mismatched card identity', async (mismatch) => {
    await expect(cancel.execute({ ...mismatch, fields: {} })).rejects.toBeInstanceOf(ConflictException)
    await expect(confirm.execute({ ...mismatch, fields: { mode: 'existing', target: 'A' } })).rejects.toBeInstanceOf(
        ConflictException
    )
    expect(moves.confirm).not.toHaveBeenCalled()
    expect(moves.dismiss).not.toHaveBeenCalled()
})

it('validates the target before moving', async () => {
    await expect(confirm.execute({ ...identity, fields: { mode: 'other' } })).rejects.toBeInstanceOf(
        BadRequestException
    )
    expect(moves.confirm).not.toHaveBeenCalled()
})

it.each([confirm, cancel])('enforces project access before reading the receipt', async (handler) => {
    permissions.assertPermission.mockRejectedValue(new ForbiddenException())
    await expect(handler.execute({ ...identity, fields: {} })).rejects.toBeInstanceOf(ForbiddenException)
    expect(feature.canActivate).toHaveBeenCalled()
    expect(permissions.assertPermission).toHaveBeenCalledWith(AIPermissionsEnum.XPERT_PROJECT_VIEW)
    expect(moves.pending).not.toHaveBeenCalled()
})

it('rejects a public assistant credential before touching the project', async () => {
    jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
        principalType: 'client_secret',
        clientSecretBindingType: SecretTokenBindingType.PUBLIC_XPERT
    } as ReturnType<typeof RequestContext.currentApiPrincipal>)
    await expect(cancel.execute({ ...identity, fields: {} })).rejects.toBeInstanceOf(ForbiddenException)
    expect(moves.pending).not.toHaveBeenCalled()
})
