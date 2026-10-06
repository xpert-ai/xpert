// Invariants: specification identity excludes progress and generic task revision.
// Persisted digests are checked before comparing a review with its implementation attempt.
import { createHash } from 'node:crypto'
import {
    projectTaskSpecificationSnapshotSchema,
    type ProjectTaskSpecification,
    type ProjectTaskSpecificationSnapshot
} from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'

/** Accept a validated specification; field and step ordering must not change its identity. */
export function createProjectTaskSpecificationSnapshot(
    specification: ProjectTaskSpecification
): ProjectTaskSpecificationSnapshot {
    const canonical: ProjectTaskSpecification = {
        version: 1,
        title: specification.title,
        description: specification.description ?? '',
        requirements: [...specification.requirements],
        steps: [...specification.steps]
            .sort((a, b) => a.stepIndex - b.stepIndex)
            .map(({ stepIndex, description }) => ({ stepIndex, description }))
    }
    return {
        digest: `sha256:${createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}`,
        specification: canonical
    }
}

export function parseProjectTaskSpecificationSnapshot(input: unknown): ProjectTaskSpecificationSnapshot {
    const parsed = projectTaskSpecificationSnapshotSchema.safeParse(input)
    if (
        !parsed.success ||
        createProjectTaskSpecificationSnapshot(parsed.data.specification).digest !== parsed.data.digest
    ) {
        throw new BadRequestException(t('server-ai:Error.ProjectTaskSpecificationInvalid'))
    }
    return parsed.data
}
