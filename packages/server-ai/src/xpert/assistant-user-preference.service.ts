import {
    ASSISTANT_USER_PREFERENCES_VERSION,
    TAssistantUserPreferenceDomain,
    TAssistantUserPreferenceDomainMap
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { DeepPartial, FindOptionsWhere, IsNull, Repository } from 'typeorm'
import { AssistantUserPreference } from './assistant-user-preference.entity'

type AssistantUserPreferenceScope = {
    tenantId: string
    organizationId: string | null
    userId: string
}

const EMPTY_ASSISTANT_USER_PREFERENCES = JSON.stringify({ version: ASSISTANT_USER_PREFERENCES_VERSION })

@Injectable()
export class AssistantUserPreferenceService {
    constructor(
        @InjectRepository(AssistantUserPreference)
        private readonly repository: Repository<AssistantUserPreference>
    ) {}

    async getPreferences(assistantId: string): Promise<AssistantUserPreference | null> {
        const scope = this.preferenceScope()
        return this.repository.findOne({ where: this.preferenceWhere(scope, assistantId) })
    }

    async getDomain<K extends TAssistantUserPreferenceDomain>(
        assistantId: string,
        domain: K
    ): Promise<TAssistantUserPreferenceDomainMap[K] | null> {
        const preference = await this.getPreferences(assistantId)
        return preference?.preferences?.[domain] ?? null
    }

    async setDomain<K extends TAssistantUserPreferenceDomain>(
        assistantId: string,
        domain: K,
        value: TAssistantUserPreferenceDomainMap[K]
    ): Promise<void> {
        const scope = this.preferenceScope()
        const where = this.preferenceWhere(scope, assistantId)
        const updated = await this.updateDomain(where, domain, value)
        if (updated) {
            return
        }

        const entity = this.repository.create({
            ...scope,
            assistantId,
            assistant: { id: assistantId },
            user: { id: scope.userId },
            preferences: {
                version: ASSISTANT_USER_PREFERENCES_VERSION,
                [domain]: value
            }
        } as DeepPartial<AssistantUserPreference>)

        try {
            await this.repository.save(entity)
        } catch (error) {
            if (!this.isUniqueViolation(error) || !(await this.updateDomain(where, domain, value))) {
                throw error
            }
        }
    }

    async clearDomain<K extends TAssistantUserPreferenceDomain>(
        assistantId: string,
        domain: K,
        expectedValue?: TAssistantUserPreferenceDomainMap[K]
    ): Promise<boolean> {
        const scope = this.preferenceScope()
        const where = this.preferenceWhere(scope, assistantId)
        const query = this.repository
            .createQueryBuilder()
            .update(AssistantUserPreference)
            .set({
                preferences: () =>
                    `(COALESCE("preferences", '{}'::jsonb) || '${EMPTY_ASSISTANT_USER_PREFERENCES}'::jsonb) #- ` +
                    `ARRAY[:preferenceDomain]::text[]`
            })
            .where(where)
            .setParameter('preferenceDomain', domain)

        if (expectedValue !== undefined) {
            query
                .andWhere(`"preferences" -> :preferenceDomain = CAST(:expectedPreferenceValue AS jsonb)`)
                .setParameter('expectedPreferenceValue', JSON.stringify(expectedValue))
        }

        const result = await query.execute()
        const cleared = (result.affected ?? 0) > 0
        if (cleared) {
            await this.deleteEmptyPreference(where)
        }
        return cleared
    }

    private async updateDomain<K extends TAssistantUserPreferenceDomain>(
        where: FindOptionsWhere<AssistantUserPreference>,
        domain: K,
        value: TAssistantUserPreferenceDomainMap[K]
    ): Promise<boolean> {
        const result = await this.repository
            .createQueryBuilder()
            .update(AssistantUserPreference)
            .set({
                preferences: () =>
                    `jsonb_set(COALESCE("preferences", '{}'::jsonb) || ` +
                    `'${EMPTY_ASSISTANT_USER_PREFERENCES}'::jsonb, ` +
                    `ARRAY[:preferenceDomain]::text[], CAST(:preferenceValue AS jsonb), true)`
            })
            .where(where)
            .setParameter('preferenceDomain', domain)
            .setParameter('preferenceValue', JSON.stringify(value))
            .execute()

        return (result.affected ?? 0) > 0
    }

    private async deleteEmptyPreference(where: FindOptionsWhere<AssistantUserPreference>): Promise<void> {
        await this.repository
            .createQueryBuilder()
            .delete()
            .from(AssistantUserPreference)
            .where(where)
            .andWhere(`("preferences" - 'version') = '{}'::jsonb`)
            .execute()
    }

    private preferenceScope(): AssistantUserPreferenceScope {
        const tenantId = RequestContext.currentTenantId()
        const userId = RequestContext.currentUserId()
        if (!tenantId || !userId) {
            throw new ForbiddenException(
                t('server-ai:Error.AssistantUserPreferenceUserRequired', {
                    defaultValue: 'A user context is required to persist Assistant preferences.'
                })
            )
        }

        return {
            tenantId,
            organizationId:
                RequestContext.currentApiPrincipal()?.requestedOrganizationId ??
                RequestContext.getOrganizationId() ??
                null,
            userId
        }
    }

    private preferenceWhere(
        scope: AssistantUserPreferenceScope,
        assistantId: string
    ): FindOptionsWhere<AssistantUserPreference> {
        return {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId ?? IsNull(),
            assistantId,
            userId: scope.userId
        }
    }

    private isUniqueViolation(error: unknown): boolean {
        return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505')
    }
}
