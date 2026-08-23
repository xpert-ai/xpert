import { IXpertProjectActivity } from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService, RequestContext } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { XpertProjectActivity } from '../entities/project-activity.entity'

@Injectable()
export class XpertProjectActivityService extends TenantOrganizationAwareCrudService<XpertProjectActivity> {
    constructor(@InjectRepository(XpertProjectActivity) repository: Repository<XpertProjectActivity>) {
        super(repository)
    }

    list(projectId: string, take = 50) {
        return this.findAll({ where: { projectId }, order: { createdAt: 'DESC' }, take })
    }

    async record(
        projectId: string,
        input: Pick<IXpertProjectActivity, 'type' | 'summary'> & Partial<IXpertProjectActivity>
    ) {
        return this.create({
            projectId,
            type: input.type,
            entityType: input.entityType,
            entityId: input.entityId,
            summary: input.summary,
            payload: sanitizeActivityPayload(input.payload),
            createdById: RequestContext.currentUserId()
        })
    }
}

function sanitizeActivityPayload(payload?: Record<string, unknown>) {
    if (!payload) return undefined
    const forbidden = /token|secret|password|prompt|authorization|apiKey/i
    const sanitize = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map((item) => sanitize(item))
        if (!value || typeof value !== 'object') return value
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([key]) => !forbidden.test(key))
                .map(([key, item]) => [key, sanitize(item)])
        )
    }
    return sanitize(payload) as Record<string, unknown>
}
