import { ForbiddenException } from '@nestjs/common'
import { ProjectContentResourceProvider } from './project-content-resource.provider'
import { ProjectAccessRuntimeService } from './project-access-runtime.service'
const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'member' }
const input = { actor, principal: { ...actor, groupIds: [] }, providerKey: 'platform.project', resourceId: 'project', operation: 'read' as const }
describe('Project-owned content authority', () => {
  it('keeps members read-only and revokes knowledge access without a Space provider', async () => {
    const listReadable = jest.fn().mockResolvedValue([{ projectId: 'project', role: 'member', archived: false, canManage: false }])
    const service = new ProjectContentResourceProvider({ listReadable } as unknown as ProjectAccessRuntimeService)
    expect(await service.authorize(input)).toMatchObject({ canWrite: false, canManage: false })
    listReadable.mockResolvedValue([])
    await expect(service.authorize(input)).rejects.toThrow(ForbiddenException)
  })
  it('delegates writes and management to the current Project policy and never authorizes an arbitrary file', async () => {
    const assertManage = jest.fn().mockRejectedValue(new ForbiddenException())
    const assertEdit = jest.fn().mockRejectedValue(new ForbiddenException())
    const listReadable = jest.fn().mockResolvedValue([{ projectId: 'project', role: 'owner', archived: false, canManage: true }])
    const service = new ProjectContentResourceProvider({ assertManage, assertEdit, listReadable } as unknown as ProjectAccessRuntimeService)
    await expect(service.authorize({ ...input, operation: 'manage' })).rejects.toThrow(ForbiddenException)
    await expect(service.authorize({ ...input, operation: 'write' })).rejects.toThrow(ForbiddenException)
    await expect(service.authorize({ ...input, filePath: 'private.md' })).rejects.toThrow(ForbiddenException)
    expect(assertManage).toHaveBeenCalledWith({ actor: input.principal, projectId: 'project' })
  })
})
