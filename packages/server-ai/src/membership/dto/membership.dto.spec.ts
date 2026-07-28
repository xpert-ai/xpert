import { MembershipSourceEnum } from '@xpert-ai/contracts'
import { validate } from 'class-validator'
import { MembershipAssignDto, MembershipPointAdjustDto } from './membership.dto'

describe('MembershipAssignDto', () => {
    it('accepts known membership sources and rejects arbitrary source values', async () => {
        const valid = Object.assign(new MembershipAssignDto(), {
            planId: 'plan-1',
            source: MembershipSourceEnum.Admin
        })
        const invalid = Object.assign(new MembershipAssignDto(), {
            planId: 'plan-1',
            source: 'arbitrary-source'
        })

        await expect(validate(valid)).resolves.toHaveLength(0)
        await expect(validate(invalid)).resolves.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    property: 'source',
                    constraints: expect.objectContaining({ isEnum: expect.any(String) })
                })
            ])
        )
    })
})

describe('MembershipPointAdjustDto', () => {
    it('accepts point adjustments with up to three decimal places', async () => {
        const input = Object.assign(new MembershipPointAdjustDto(), {
            pointDelta: 1.234
        })

        await expect(validate(input)).resolves.toHaveLength(0)
    })

    it('rejects point adjustments with more than three decimal places', async () => {
        const input = Object.assign(new MembershipPointAdjustDto(), {
            pointDelta: 1.2345
        })

        await expect(validate(input)).resolves.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    property: 'pointDelta',
                    constraints: expect.objectContaining({ isNumber: expect.any(String) })
                })
            ])
        )
    })
})
