jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { managedPipelineFixture } from './testing/pipeline-managed.fixture'
import { registerManagedCases1 } from './testing/pipeline-managed-1.cases'
import { registerManagedCases2 } from './testing/pipeline-managed-2.cases'
import { registerManagedCases3 } from './testing/pipeline-managed-3.cases'

const integration = process.env.XPERT_PIPELINE_TEST_DATABASE_URL ? describe : describe.skip
integration('managed pipeline launch and adapter execution', () => {
    const fixture = managedPipelineFixture()
    registerManagedCases1(fixture)
    registerManagedCases2(fixture)
    registerManagedCases3(fixture)
})
