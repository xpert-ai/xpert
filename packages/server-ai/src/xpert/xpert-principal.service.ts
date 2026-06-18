import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { IUser } from '@xpert-ai/contracts'
import { UserService } from '@xpert-ai/server-core'
import { Xpert } from './xpert.entity'
import { XpertService } from './xpert.service'

const XPERT_PRINCIPAL_USER_RELATIONS = ['role', 'role.rolePermissions', 'employee'] as const

export type XpertPrincipalTarget = {
    id?: string | null
    tenantId?: string | null
    organizationId?: string | null
    userId?: string | null
    user?: IUser | null
    slug?: string | null
}

export type EnsureXpertPrincipalInput = {
    xpertId: string
    tenantId: string
    organizationId?: string | null
}

export type EnsureXpertPrincipalResult = {
    xpert: XpertPrincipalTarget
    user: IUser
}

@Injectable()
export class XpertPrincipalService {
    constructor(
        private readonly xpertService: XpertService,
        private readonly userService: UserService
    ) {}

    async ensurePrincipalUserByXpertId(input: EnsureXpertPrincipalInput): Promise<EnsureXpertPrincipalResult> {
        const xpertId = this.normalizeString(input.xpertId)
        const tenantId = this.normalizeString(input.tenantId)
        if (!xpertId) {
            throw new BadRequestException('xpert_principal_xpert_id_required')
        }
        if (!tenantId) {
            throw new BadRequestException('xpert_principal_tenant_id_required')
        }

        const xpert = await this.findXpertForPrincipal({
            xpertId,
            tenantId,
            organizationId: this.normalizeString(input.organizationId) || null
        })
        const user = await this.ensurePrincipalUser(xpert)

        return {
            xpert: {
                ...xpert,
                user,
                userId: user.id
            },
            user
        }
    }

    async ensurePrincipalUser(xpert: XpertPrincipalTarget): Promise<IUser> {
        const xpertId = this.normalizeString(xpert.id)
        const tenantId = this.normalizeString(xpert.tenantId)
        if (!xpertId) {
            throw new BadRequestException('xpert_principal_xpert_id_required')
        }
        if (!tenantId) {
            throw new BadRequestException('xpert_principal_tenant_id_required')
        }

        const existingUser = await this.resolveExistingPrincipalUser(xpert, tenantId)
        if (existingUser) {
            return existingUser
        }

        const user = await this.userService.ensureCommunicationUser({
            tenantId,
            thirdPartyId: this.buildPrincipalThirdPartyId(xpertId),
            username: this.normalizeString(xpert.slug) || xpertId
        })

        await this.xpertService.update(xpertId, {
            user,
            userId: user.id
        } as Partial<Xpert>)

        return user
    }

    private async findXpertForPrincipal(input: {
        xpertId: string
        tenantId: string
        organizationId?: string | null
    }): Promise<XpertPrincipalTarget> {
        const query = this.xpertService.repository
            .createQueryBuilder('xpert')
            .leftJoinAndSelect('xpert.user', 'user')
            .where('xpert.id = :xpertId', { xpertId: input.xpertId })
            .andWhere('xpert."tenantId" = :tenantId', { tenantId: input.tenantId })

        if (input.organizationId) {
            query.andWhere('xpert."organizationId" = :organizationId', { organizationId: input.organizationId })
        }

        const xpert = await query.limit(1).getOne()
        if (!xpert) {
            throw new NotFoundException({
                code: 'xpert_principal_xpert_not_found',
                message: 'Target Xpert was not found for principal initialization.',
                xpertId: input.xpertId
            })
        }

        return xpert
    }

    private async resolveExistingPrincipalUser(xpert: XpertPrincipalTarget, tenantId: string): Promise<IUser | null> {
        if (xpert.user?.id) {
            return xpert.user
        }

        const userId = this.normalizeString(xpert.userId)
        if (!userId) {
            return null
        }

        try {
            return await this.userService.findOneByIdWithinTenant(userId, tenantId, {
                relations: [...XPERT_PRINCIPAL_USER_RELATIONS]
            })
        } catch {
            return null
        }
    }

    private buildPrincipalThirdPartyId(xpertId: string): string {
        return `xpert:${xpertId}`
    }

    private normalizeString(value: unknown): string {
        return typeof value === 'string' ? value.trim() : ''
    }
}
