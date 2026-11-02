import { RolesEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import i18next from 'i18next'
import { publicFileParseStatus } from './file-asset-public'

describe('application file parse diagnostics', () => {
    beforeAll(async () => { await i18next.init({ lng: 'en', resources: { en: { 'server-ai': { Error: {
        application_storage_limit: 'Storage limit reached', ApplicationRuntimeFailed: 'Task could not be completed'
    } } } } }) })
    beforeEach(() => jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.APP_USER } }))
    afterEach(() => jest.restoreAllMocks())
    it('retains the known storage recovery reason', () => {
        expect(publicFileParseStatus({ error: 'APP_PLATFORM_FAILURE:application_storage_limit' }).error).toBe('Storage limit reached')
    })
    it('does not expose arbitrary database or provider errors', () => {
        expect(publicFileParseStatus({ error: 'SELECT private_content FROM private_table' }).error).toBe('Task could not be completed')
    })
})
