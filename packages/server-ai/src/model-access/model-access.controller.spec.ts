import { AIPermissionsEnum, AiModelTypeEnum, ModelAccessRequestStatusEnum } from '@xpert-ai/contracts'
import { PERMISSIONS_METADATA } from '@xpert-ai/server-common'
import { ModelAccessController } from './model-access.controller'
import { ModelAccessService } from './model-access.service'

describe('ModelAccessController', () => {
  const service = {
    getCatalog: jest.fn(),
    findMyRequests: jest.fn(),
    createRequest: jest.fn(),
    withdrawRequest: jest.fn(),
    findMyGrants: jest.fn(),
    findAdminRequests: jest.fn(),
    findAdminGrants: jest.fn(),
    findAdminEvents: jest.fn(),
    approveRequest: jest.fn(),
    rejectRequest: jest.fn(),
    extendGrant: jest.fn(),
    revokeGrant: jest.fn()
  }
  let controller: ModelAccessController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new ModelAccessController(service as unknown as ModelAccessService)
  })

  it('delegates all account endpoints without accepting a client scope', async () => {
    const requestInput = {
      copilotId: 'copilot-1',
      copilotModelId: 'gpt-4.1',
      modelType: AiModelTypeEnum.LLM,
      reason: 'Needed for authoring'
    }
    service.getCatalog.mockResolvedValue({ items: [] })
    service.findMyRequests.mockResolvedValue([])
    service.createRequest.mockResolvedValue({ id: 'request-1' })
    service.withdrawRequest.mockResolvedValue({ id: 'request-1' })
    service.findMyGrants.mockResolvedValue([])

    await expect(controller.getCatalog()).resolves.toEqual({ items: [] })
    await expect(controller.getMyRequests()).resolves.toEqual([])
    await expect(controller.createRequest(requestInput)).resolves.toEqual({ id: 'request-1' })
    await expect(controller.withdrawRequest('request-1', { reason: 'No longer needed' })).resolves.toEqual({
      id: 'request-1'
    })
    await expect(controller.getMyGrants()).resolves.toEqual([])

    expect(service.createRequest).toHaveBeenCalledWith(requestInput)
    expect(service.withdrawRequest).toHaveBeenCalledWith('request-1', { reason: 'No longer needed' })
  })

  it('maps pagination and filters for every admin list endpoint', async () => {
    const query = {
      search: 'qwen',
      modelType: AiModelTypeEnum.LLM,
      status: ModelAccessRequestStatusEnum.Requested
    }
    service.findAdminRequests.mockResolvedValue({ items: [], total: 0 })
    service.findAdminGrants.mockResolvedValue({ items: [], total: 0 })
    service.findAdminEvents.mockResolvedValue({ items: [], total: 0 })

    await controller.getAdminRequests(query, 25, 50)
    await controller.getAdminGrants(query, 25, 50)
    await controller.getAdminEvents(query, 25, 50)

    for (const method of [
      service.findAdminRequests,
      service.findAdminGrants,
      service.findAdminEvents
    ]) {
      expect(method).toHaveBeenCalledWith({
        ...query,
        take: 25,
        skip: 50
      })
    }
  })

  it('delegates every admin state transition with its required input', async () => {
    service.approveRequest.mockResolvedValue({ id: 'grant-1' })
    service.rejectRequest.mockResolvedValue({ id: 'request-1' })
    service.extendGrant.mockResolvedValue({ id: 'grant-1' })
    service.revokeGrant.mockResolvedValue({ id: 'grant-1' })

    await controller.approveRequest('request-1', { validUntil: '2027-03-14', note: 'Approved' })
    await controller.rejectRequest('request-1', { reason: 'Not justified' })
    await controller.extendGrant('grant-1', { validUntil: null, note: 'Permanent' })
    await controller.revokeGrant('grant-1', { reason: 'Model retired' })

    expect(service.approveRequest).toHaveBeenCalledWith('request-1', {
      validUntil: '2027-03-14',
      note: 'Approved'
    })
    expect(service.rejectRequest).toHaveBeenCalledWith('request-1', { reason: 'Not justified' })
    expect(service.extendGrant).toHaveBeenCalledWith('grant-1', {
      validUntil: null,
      note: 'Permanent'
    })
    expect(service.revokeGrant).toHaveBeenCalledWith('grant-1', { reason: 'Model retired' })
  })

  it('allows view or edit permission for reads and requires edit permission for mutations', () => {
    for (const method of [
      ModelAccessController.prototype.getAdminRequests,
      ModelAccessController.prototype.getAdminGrants,
      ModelAccessController.prototype.getAdminEvents
    ]) {
      expect(Reflect.getMetadata(PERMISSIONS_METADATA, method)).toEqual([
        AIPermissionsEnum.MODEL_ACCESS_REQUEST_VIEW,
        AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT
      ])
    }

    for (const method of [
      ModelAccessController.prototype.approveRequest,
      ModelAccessController.prototype.rejectRequest,
      ModelAccessController.prototype.extendGrant,
      ModelAccessController.prototype.revokeGrant
    ]) {
      expect(Reflect.getMetadata(PERMISSIONS_METADATA, method)).toEqual([
        AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT
      ])
    }
  })
})
