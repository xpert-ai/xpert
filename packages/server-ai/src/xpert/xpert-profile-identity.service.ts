import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { IXpert, XpertViewAssistantIdentity } from '@xpert-ai/contracts'
import { IsNull, Repository } from 'typeorm'
import { Xpert } from './xpert.entity'

@Injectable()
export class XpertProfileIdentityService {
    constructor(@InjectRepository(Xpert) private readonly xperts: Repository<Xpert>) {}

    async resolve(xpert: IXpert): Promise<XpertViewAssistantIdentity> {
        const family =
            xpert.slug && xpert.tenantId
                ? await this.xperts.find({
                      select: { id: true, latest: true, publishAt: true },
                      where: {
                          tenantId: xpert.tenantId,
                          organizationId: xpert.organizationId ?? IsNull(),
                          workspaceId: xpert.workspaceId ?? IsNull(),
                          type: xpert.type,
                          slug: xpert.slug
                      }
                  })
                : []
        const current = family.filter((item) => item.latest)
        return {
            instanceId: xpert.id,
            currentId: current.length === 1 ? current[0].id : xpert.id,
            versionIds: [
                ...new Set([xpert.id, ...family.filter((item) => item.publishAt || item.latest).map((item) => item.id)])
            ]
        }
    }
}
