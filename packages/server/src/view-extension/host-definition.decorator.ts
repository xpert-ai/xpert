import { SetMetadata } from '@nestjs/common'

export const VIEW_HOST_DEFINITION = 'XPERT_VIEW_HOST_DEFINITION'

export const ViewHostDefinition = (hostType: string) => SetMetadata(VIEW_HOST_DEFINITION, hostType)
