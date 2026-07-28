import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import {
    ModelAccessRequestApproveDto,
    ModelAccessRequestCreateDto,
    ModelAccessRequestRejectDto,
    UserModelGrantExtendDto,
    UserModelGrantRevokeDto
} from './model-access.dto'

describe('model access DTO validation', () => {
    it.each([
        [ModelAccessRequestCreateDto, { copilotId: 'copilot-1', copilotModelId: 'model-1', modelType: AiModelTypeEnum.LLM, reason: '   ' }],
        [ModelAccessRequestRejectDto, { reason: '   ' }],
        [UserModelGrantRevokeDto, { reason: '   ' }]
    ])('requires a non-empty reason for %p', async (type, input) => {
        const errors = await validate(plainToInstance(type, input))

        expect(errors).not.toHaveLength(0)
    })

    it.each([ModelAccessRequestApproveDto, UserModelGrantExtendDto])(
        'accepts date-only expirations and rejects timestamps for %p',
        async (type) => {
            await expect(validate(plainToInstance(type, { validUntil: '2027-03-14' }))).resolves.toHaveLength(0)
            await expect(
                validate(plainToInstance(type, { validUntil: '2027-03-14T23:59:59.999Z' }))
            ).resolves.not.toHaveLength(0)
        }
    )
})
