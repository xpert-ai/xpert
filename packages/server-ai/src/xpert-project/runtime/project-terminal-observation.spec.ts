jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ProjectRuntimeObservationCommand } from '../../handoff/runtime-messaging/runtime-message.commands'
import { ProjectRuntimeObservationHandler } from './project-runtime-observation.handler'

const actor = { tenantId: 'tenant', organizationId: 'organization', userId: 'owner' }

describe('trusted terminal Project projection', () => {
    afterEach(() => jest.restoreAllMocks())

    it('uses only the persisted actor scope without restoring business permissions', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockImplementation(() => {
            throw new Error('no ambient identity')
        })
        jest.spyOn(RequestContext, 'getOrganizationId').mockImplementation(() => {
            throw new Error('no ambient identity')
        })
        jest.spyOn(RequestContext, 'currentUserId').mockImplementation(() => {
            throw new Error('no ambient identity')
        })
        const findOneBy = jest.fn(async () => null)
        const transaction = jest.fn()
        const handler = new ProjectRuntimeObservationHandler({
            getRepository: () => ({ findOneBy }),
            transaction
        } as never)
        await handler.execute(new ProjectRuntimeObservationCommand('invocation', actor))
        expect(findOneBy).toHaveBeenCalledWith({
            id: 'invocation',
            tenantId: 'tenant',
            organizationId: 'organization',
            ownerId: 'owner'
        })
        expect(transaction).not.toHaveBeenCalled()
    })

    it.each(['running', 'failed'])('cannot project %s without confirmed terminal evidence', async (status) => {
        const invocation = {
            status,
            completionEvidence: 2,
            get request(): never {
                throw new Error('must reject before accessing Project task routing')
            }
        }
        const findOneBy = jest.fn(async () => ({ invocation }))
        const transaction = jest.fn()
        const handler = new ProjectRuntimeObservationHandler({
            getRepository: () => ({ findOneBy }),
            transaction
        } as never)
        await handler.execute(new ProjectRuntimeObservationCommand('invocation', actor))
        expect(transaction).not.toHaveBeenCalled()
    })
})
