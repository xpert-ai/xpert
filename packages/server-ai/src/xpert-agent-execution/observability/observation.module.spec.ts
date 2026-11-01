import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Organization, SecretToken, User, UserOrganization } from '@xpert-ai/server-core'
import { XpertAgentExecution } from '../agent-execution.entity'
import { MembershipPointLedger } from '../../membership/membership-point-ledger.entity'
import { ExecutionObservationModule } from './observation.module'
import { ExecutionObservationService } from './observation.service'
import { ObservationAccessService } from './observation-access.service'
import { ObservationUsageService } from './observation-usage.service'

it('wires the scoped capability through an explicit Nest module and fails closed without identity', async () => {
    let builder = Test.createTestingModule({ imports: [ExecutionObservationModule] })
    for (const entity of [
        XpertAgentExecution,
        MembershipPointLedger,
        User,
        UserOrganization,
        Organization,
        SecretToken
    ]) {
        builder = builder.overrideProvider(getRepositoryToken(entity)).useValue({})
    }
    const module = await builder.compile()
    expect(module.get(ObservationAccessService)).toBeInstanceOf(ObservationAccessService)
    expect(module.get(ObservationUsageService)).toBeInstanceOf(ObservationUsageService)
    const api = module.get(ExecutionObservationService).createScopedApi({})
    await expect(api.query({ from: '2026-10-26T00:00:00Z', to: '2026-10-26T01:00:00Z' })).rejects.toThrow()
    await module.close()
})
