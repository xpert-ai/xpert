import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { SetMetadata } from '@nestjs/common'

export const XPERT_PROJECT_PERMISSION = 'xpert-project:permission'

export const ProjectPermission = (permission: AIPermissionsEnum) => SetMetadata(XPERT_PROJECT_PERMISSION, permission)
