import { IXpert } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Not, Repository } from 'typeorm'
import { Xpert } from '../../xpert/xpert.entity'
import { isSameXpertFamily } from '../../xpert/xpert-family'
import { XpertProject } from '../entities/project.entity'

export type XpertProjectXpertScope = {
    tenantId: string
    organizationId?: string | null
}

/**
 * Project relations identify an Xpert family, while published version snapshots
 * are implementation history. The current Xpert record is the canonical stored relation.
 */
@Injectable()
export class XpertProjectXpertBindingService {
    constructor(
        @InjectRepository(Xpert) private readonly xpertRepository: Repository<Xpert>,
        @InjectRepository(XpertProject) private readonly projectRepository: Repository<XpertProject>
    ) {}

    isSameXpert(left: IXpert, right: IXpert) {
        return isSameXpertFamily(left, right)
    }

    contains(project: XpertProject, xpert: IXpert) {
        return project.xperts?.some((linkedXpert) => this.isSameXpert(linkedXpert, xpert)) ?? false
    }

    async resolveCurrent(xpert: IXpert): Promise<IXpert> {
        if (xpert.latest === true) return xpert

        return (
            (await this.xpertRepository.findOne({
                where: {
                    tenantId: xpert.tenantId,
                    organizationId: xpert.organizationId ?? IsNull(),
                    workspaceId: xpert.workspaceId ?? IsNull(),
                    type: xpert.type,
                    slug: xpert.slug,
                    latest: true,
                    publishAt: Not(IsNull())
                }
            })) ?? xpert
        )
    }

    async resolveCurrentById(id: string, scope: XpertProjectXpertScope): Promise<IXpert | null> {
        const xpert = await this.xpertRepository.findOne({
            where: {
                id,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId ?? IsNull(),
                publishAt: Not(IsNull())
            }
        })

        if (!xpert) return null
        const currentXpert = await this.resolveCurrent(xpert)
        return currentXpert.latest === true ? currentXpert : null
    }

    async normalize(project: XpertProject, options: { persist?: boolean } = {}): Promise<XpertProject> {
        const linkedXperts = project.xperts ?? []
        const currentXperts: IXpert[] = []
        let changed = false

        for (const linkedXpert of linkedXperts) {
            const currentXpert = await this.resolveCurrent(linkedXpert)
            if (currentXpert.id !== linkedXpert.id) changed = true
            if (currentXperts.some((item) => this.isSameXpert(item, currentXpert))) {
                changed = true
                continue
            }
            currentXperts.push(currentXpert)
        }

        project.xperts = currentXperts
        if (changed && options.persist) await this.projectRepository.save(project)
        return project
    }
}
