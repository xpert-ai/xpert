import { MembershipLedgerSourceEnum, USAGE_HOUR_FORMAT } from '@xpert-ai/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Repository, type WhereExpressionBuilder } from 'typeorm'
import { MembershipPointLedger } from '../../../membership/membership-point-ledger.entity'
import { formatInUTC0 } from '../../../shared/utils'
import { CopilotUser } from '../../copilot-user.entity'
import { CopilotUserUsageQuery } from '../copilot-user-usage.query'

@QueryHandler(CopilotUserUsageQuery)
export class CopilotUserUsageHandler implements IQueryHandler<CopilotUserUsageQuery> {
    constructor(@InjectRepository(CopilotUser) private readonly repository: Repository<CopilotUser>) {}

    public async execute(command: CopilotUserUsageQuery) {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const { userId, xpertId, start, end, threadId } = command.params
        const endHour = end ?? formatInUTC0(new Date(), USAGE_HOUR_FORMAT)
        const scope = (query: WhereExpressionBuilder, organization: string) => {
            query.andWhere('usage.tenantId = :tenantId', { tenantId })
            query.andWhere('usage.usageHour <= :endHour', { endHour })
            if (organizationId) query.andWhere(`${organization} = :organizationId`, { organizationId })
            else query.andWhere(`${organization} IS NULL`)
            if (userId) query.andWhere('usage.userId = :userId', { userId })
            if (xpertId) query.andWhere('usage.xpertId = :xpertId', { xpertId })
            if (threadId) query.andWhere('usage.threadId = :threadId', { threadId })
            if (start) query.andWhere('usage.usageHour >= :start', { start })
        }

        const tokens = this.repository.createQueryBuilder('usage').select('SUM(usage.tokenUsed)', 'total')
        const debits = this.repository.manager
            .getRepository(MembershipPointLedger)
            .createQueryBuilder('usage')
            .select('-SUM(usage.pointsDelta)', 'total')
            .where('usage.source IN (:...sources)', {
                sources: [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage]
            })
        scope(tokens, 'usage.organizationId')
        scope(debits, 'COALESCE(usage.runtimeOrganizationId, usage.organizationId)')
        const [tokenRow, debitRow] = await Promise.all([
            tokens.getRawOne<{ total: string | null }>(),
            debits.getRawOne<{ total: string | null }>()
        ])
        if (tokenRow?.total == null && debitRow?.total == null) return []
        return [
            {
                tokenUsed: Number(tokenRow?.total ?? 0),
                chargedPoints: debitRow?.total == null ? null : Number(debitRow.total)
            }
        ]
    }
}
