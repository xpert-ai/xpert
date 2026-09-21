import type { IXpert } from '@xpert-ai/contracts'
import type { ProjectEnsureInput, ProjectExternalAssistantExpectation } from '@xpert-ai/plugin-sdk'
import { BadRequestException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { t } from 'i18next'
import { FindXpertQuery } from '../../xpert/queries'
import {
    describeExternalAssistantBinding,
    directExternalAssistantIds,
    matchesExternalAssistantExpectation,
    type ResolvedExternalAssistantBinding
} from '../../xpert/external-assistant-binding'

/**
 * Resolve required portable roles only through the requester's direct Assistant edges.
 * Reject missing, ambiguous, unpublished or incompatible bindings before Project provisioning.
 */
export async function resolveProjectExternalXperts(
    queryBus: QueryBus,
    requester: IXpert,
    input: ProjectEnsureInput
): Promise<IXpert[]> {
    const expectations = normalizeProjectExternalAssistantExpectations(input.externalAssistantExpectations)
    if (!expectations.length) return []
    const requesterAgentKey = requiredProjectText(input.requesterAgentKey ?? '', 'requesterAgentKey', 100)
    if (requester.agent?.key !== requesterAgentKey) {
        throw new BadRequestException(
            t('server-ai:Error.ProjectRequesterAgentMismatch', {
                defaultValue: 'The requester Agent must be the primary Agent of the Project Assistant.'
            })
        )
    }

    const candidates = await Promise.all(
        directExternalAssistantIds(requester, requesterAgentKey).map(async (candidateId) => {
            try {
                return await queryBus.execute<FindXpertQuery, IXpert>(
                    new FindXpertQuery({ id: candidateId }, { relations: ['agent'] })
                )
            } catch {
                return null
            }
        })
    )
    const availableCandidates = candidates.filter((candidate): candidate is IXpert => candidate !== null)
    const bindings = availableCandidates.map((candidate) => ({
        candidate,
        descriptor: describeExternalAssistantBinding(requester, candidate)
    }))

    const resolved: IXpert[] = []
    for (const expectation of expectations) {
        const matches = bindings.filter(({ descriptor }) =>
            matchesExternalAssistantExpectation(descriptor, expectation)
        )
        if (matches.length > 1) {
            throw projectExternalAssistantError('ProjectAssistantBindingAmbiguous', 'ambiguous')
        }
        const match = matches[0]
        if (!match) {
            const nearMatch = bindings.find(({ descriptor }) =>
                isNearProjectExternalAssistantMatch(descriptor, expectation)
            )
            throw projectExternalAssistantError(
                nearMatch?.descriptor.status === 'unpublished'
                    ? 'ProjectAssistantBindingUnpublished'
                    : nearMatch?.descriptor.status === 'cross_organization'
                      ? 'ProjectAssistantBindingCrossOrganization'
                      : nearMatch
                        ? 'ProjectAssistantBindingIncompatible'
                        : 'ProjectAssistantBindingMissing',
                nearMatch?.descriptor.status ?? 'missing'
            )
        }
        if (match.descriptor.status === 'unpublished') {
            throw projectExternalAssistantError('ProjectAssistantBindingUnpublished', 'unpublished')
        }
        if (match.descriptor.status === 'cross_organization') {
            throw projectExternalAssistantError('ProjectAssistantBindingCrossOrganization', 'cross_organization')
        }
        if (match.descriptor.status !== 'available') {
            throw projectExternalAssistantError('ProjectAssistantBindingIncompatible', 'incompatible')
        }
        // The requester Assistant and its direct, required graph edge are the
        // authorization anchor for portable role resolution. Re-applying the
        // USER_XPERT token audience to the target here would reject every
        // valid external Assistant because that delegated token is purposely
        // scoped to the requester only. The candidate has already been fully
        // validated for publication, organization and portable identity.
        resolved.push(match.candidate)
    }
    return resolved
}

export function requiredProjectText(value: string, field: string, maxLength: number): string {
    const normalized = value?.trim()
    if (!normalized || normalized.length > maxLength) {
        throw new BadRequestException(`${field} is required and must not exceed ${maxLength} characters`)
    }
    return normalized
}

function normalizeProjectExternalAssistantExpectations(
    expectations: ProjectExternalAssistantExpectation[] | undefined
): ProjectExternalAssistantExpectation[] {
    const normalized = Array.from(
        new Map(
            (expectations ?? []).map((expectation) => {
                const value = {
                    pluginName: requiredProjectText(expectation.pluginName, 'pluginName', 160),
                    templateKey: requiredProjectText(expectation.templateKey, 'templateKey', 160),
                    agentKey: requiredProjectText(expectation.agentKey, 'agentKey', 160)
                }
                return [`${value.pluginName}\u0000${value.templateKey}\u0000${value.agentKey}`, value] as const
            })
        ).values()
    )
    if (normalized.length > 32) {
        throw new BadRequestException(
            t('server-ai:Error.ProjectExternalExpectationsLimit', {
                defaultValue: 'A Project ensure request cannot contain more than 32 External Assistant expectations.'
            })
        )
    }
    return normalized
}

function isNearProjectExternalAssistantMatch(
    binding: ResolvedExternalAssistantBinding,
    expectation: ProjectExternalAssistantExpectation
) {
    return (
        binding.templateSource?.templateKey === expectation.templateKey ||
        binding.primaryAgentKey === expectation.agentKey
    )
}

function projectExternalAssistantError(key: string, fallbackStatus: string) {
    return new BadRequestException({
        errorCode: `project_assistant_binding_${fallbackStatus}`,
        message: t(`server-ai:Error.${key}`, {
            defaultValue: `The required External Assistant binding is ${fallbackStatus}.`
        })
    })
}
