import {
  IModelAccessRequest,
  IUserModelGrant,
  ModelAccessUnavailableReasonEnum,
  UserModelGrantStatusEnum
} from '@xpert-ai/contracts'

export function getCurrentModelAccessStatus(
  request: Pick<IModelAccessRequest, 'id' | 'status'>,
  grants: ReadonlyArray<Pick<IUserModelGrant, 'requestId' | 'status'>>
) {
  return grants.find((grant) => grant.requestId === request.id)?.status ?? request.status
}

export function getGrantUnavailableReason(
  grant: Pick<IUserModelGrant, 'status' | 'lastUnavailableReason'>
): ModelAccessUnavailableReasonEnum | null {
  switch (grant.status) {
    case UserModelGrantStatusEnum.Revoked:
      return ModelAccessUnavailableReasonEnum.GrantRevoked
    case UserModelGrantStatusEnum.Expired:
      return ModelAccessUnavailableReasonEnum.GrantExpired
    case UserModelGrantStatusEnum.Active:
      return grant.lastUnavailableReason ?? null
  }
}
