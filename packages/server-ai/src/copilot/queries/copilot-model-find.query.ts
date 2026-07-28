import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { IQuery } from '@nestjs/cqrs'

export enum CopilotModelCatalogMode {
    Available = 'available',
    Management = 'management',
    MembershipManagement = 'membership-management'
}

export class FindCopilotModelsQuery implements IQuery {
    static readonly type = '[Copilot] Find Models'

    constructor(
        public readonly type: AiModelTypeEnum,
        public readonly catalogMode = CopilotModelCatalogMode.Available,
        public readonly accessUserId?: string | null
    ) {}
}
