import { ArgumentMetadata, BadRequestException } from '@nestjs/common'
import { createXpertTaskRunAsProposalValidationPipe, XpertTaskRunAsProposalDTO } from './run-as.dto'

describe('XpertTaskRunAsProposalDTO', () => {
    const metadata: ArgumentMetadata = { type: 'body', metatype: XpertTaskRunAsProposalDTO }

    it('accepts a single run-as user id', async () => {
        const result = await createXpertTaskRunAsProposalValidationPipe().transform(
            { runAsUserId: '11111111-1111-4111-8111-111111111111' },
            metadata
        )

        expect(result).toBeInstanceOf(XpertTaskRunAsProposalDTO)
        expect(result).toEqual({ runAsUserId: '11111111-1111-4111-8111-111111111111' })
    })

    it.each([{ runAsUserId: 'not-a-uuid' }, { runAsUserId: '11111111-1111-4111-8111-111111111111', ownerId: 'x' }])(
        'rejects an invalid or extended proposal payload',
        async (payload) => {
            await expect(
                createXpertTaskRunAsProposalValidationPipe().transform(payload, metadata)
            ).rejects.toBeInstanceOf(BadRequestException)
        }
    )
})
