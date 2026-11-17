import { BadRequestException, ConflictException } from '@nestjs/common'
import { t } from 'i18next'

const errors = {
    invalid_execution_id: [BadRequestException, 'The execution ID is invalid.'],
    invalid_review_page: [BadRequestException, 'The review queue or page is invalid.'],
    review_version_changed: [ConflictException, 'The routing version has changed. Reload this case before submitting.'],
    execution_already_reviewed: [ConflictException, 'This execution already has a different review.'],
    source_unavailable: [
        BadRequestException,
        'The original message could not be verified. Mark this case as insufficient evidence.'
    ],
    invalid_review_evidence: [BadRequestException, 'The learning event does not match this review.'],
    invalid_review_observation: [BadRequestException, 'The runtime observation does not match this review.']
} as const

export function reviewError(code: keyof typeof errors): never {
    const [Exception, defaultValue] = errors[code]
    throw new Exception({ code, message: t(`server-ai:ExecutionReview.${code}`, { defaultValue }) })
}
