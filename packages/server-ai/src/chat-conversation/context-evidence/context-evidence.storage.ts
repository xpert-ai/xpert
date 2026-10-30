import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import { ContextEvidence } from './context-evidence.entity'
import { ContextEvidenceScope, ContextEvidenceStorage, EvidenceRecord } from './context-evidence.schema'

@Injectable()
export class DatabaseContextEvidenceStorage extends ContextEvidenceStorage {
    constructor(@InjectRepository(ContextEvidence) private readonly repository: Repository<ContextEvidence>) {
        super()
    }

    async put(scope: ContextEvidenceScope, records: EvidenceRecord[]) {
        for (let offset = 0; offset < records.length; offset += 100) {
            await this.repository
                .createQueryBuilder()
                .insert()
                .values(
                    records.slice(offset, offset + 100).map((record) => ({
                        ...record,
                        tenantId: scope.tenantId,
                        organizationId: scope.organizationId,
                        conversationId: scope.conversationId,
                        threadId: scope.threadId,
                        agentKey: scope.agentKey,
                        createdById: scope.userId
                    }))
                )
                .orIgnore()
                .execute()
        }
    }

    async get(scope: ContextEvidenceScope, ids: string[]): Promise<EvidenceRecord[]> {
        const result: EvidenceRecord[] = []
        for (let offset = 0; offset < ids.length; offset += 100) {
            result.push(
                ...(await this.repository.find({
                    where: {
                        tenantId: scope.tenantId,
                        organizationId: scope.organizationId ?? IsNull(),
                        conversationId: scope.conversationId,
                        threadId: scope.threadId,
                        agentKey: scope.agentKey,
                        evidenceId: In(ids.slice(offset, offset + 100))
                    },
                    select: { evidenceId: true, payload: true }
                }))
            )
        }
        return result
    }
}
