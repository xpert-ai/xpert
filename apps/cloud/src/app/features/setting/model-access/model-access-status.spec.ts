import {
  ModelAccessRequestStatusEnum,
  ModelAccessUnavailableReasonEnum,
  UserModelGrantStatusEnum
} from '@xpert-ai/contracts'
import { getCurrentModelAccessStatus, getGrantUnavailableReason } from './model-access-status'

describe('model access display status', () => {
  it('uses the current grant status after a request was approved', () => {
    const request = { id: 'request-1', status: ModelAccessRequestStatusEnum.Approved }

    expect(
      getCurrentModelAccessStatus(request, [{ requestId: request.id, status: UserModelGrantStatusEnum.Revoked }])
    ).toBe(UserModelGrantStatusEnum.Revoked)
  })

  it('keeps the request status when no grant was created', () => {
    const request = { id: 'request-1', status: ModelAccessRequestStatusEnum.Rejected }

    expect(getCurrentModelAccessStatus(request, [])).toBe(ModelAccessRequestStatusEnum.Rejected)
  })

  it('reports terminal grant states as unavailable before considering runtime availability', () => {
    expect(
      getGrantUnavailableReason({
        status: UserModelGrantStatusEnum.Revoked,
        lastUnavailableReason: null
      })
    ).toBe(ModelAccessUnavailableReasonEnum.GrantRevoked)
    expect(
      getGrantUnavailableReason({
        status: UserModelGrantStatusEnum.Expired,
        lastUnavailableReason: null
      })
    ).toBe(ModelAccessUnavailableReasonEnum.GrantExpired)
  })

  it('uses runtime availability only for active grants', () => {
    expect(
      getGrantUnavailableReason({
        status: UserModelGrantStatusEnum.Active,
        lastUnavailableReason: ModelAccessUnavailableReasonEnum.ModelDisabled
      })
    ).toBe(ModelAccessUnavailableReasonEnum.ModelDisabled)
    expect(
      getGrantUnavailableReason({
        status: UserModelGrantStatusEnum.Active,
        lastUnavailableReason: null
      })
    ).toBeNull()
  })
})
