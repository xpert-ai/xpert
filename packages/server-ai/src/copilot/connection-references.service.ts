import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { CopilotRoleDefault } from './role-defaults/role-default.entity'
import { CopilotModel } from '../copilot-model/copilot-model.entity'
import { Xpert } from '../xpert/xpert.entity'

@Injectable()
export class ConnectionReferencesService {
    constructor(
        @InjectRepository(CopilotRoleDefault) private readonly defaults: Repository<CopilotRoleDefault>,
        @InjectRepository(CopilotModel) private readonly models: Repository<CopilotModel>,
        @InjectRepository(Xpert) private readonly xperts: Repository<Xpert>
    ) {}
    async inspect(copilotId: string) {
        const tenantId = RequestContext.currentTenantId()
        const [defaults, bindings, drafts] = await Promise.all([
            this.defaults
                .createQueryBuilder('setting')
                .where('setting.tenantId = :tenantId', { tenantId })
                .andWhere("setting.mode = 'fixed' AND setting.binding ->> 'copilotId' = :copilotId", { copilotId })
                .getCount(),
            this.models.countBy({ tenantId, copilotId }),
            this.xperts
                .createQueryBuilder('assistant')
                .where('assistant.tenantId = :tenantId', { tenantId })
                .andWhere('assistant.latest = true')
                .andWhere(
                    `jsonb_path_exists(assistant.draft::jsonb, '$.**.copilotId ? (@ == $id)', jsonb_build_object('id', CAST(:copilotId AS text)))`,
                    { copilotId }
                )
                .getCount()
        ])
        return { defaults, bindings, drafts }
    }
}
