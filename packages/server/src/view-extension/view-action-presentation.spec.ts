import { RolesEnum, XpertViewActionResult } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import i18next from 'i18next'
import { presentViewActionResult } from './view-action-presentation'

describe('application View failure presentation', () => {
  beforeAll(async () => { await i18next.init({ lng: 'en', resources: {} }) })
  beforeEach(() => { jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.APP_USER } }) })
  afterEach(() => jest.restoreAllMocks())
  it('renders a caught database storage failure without leaking provider diagnostics', () => {
    const result = presentViewActionResult({ success: false, message: { en_US: 'APP_PLATFORM_FAILURE:application_storage_limit' }, data: { query: 'private SQL' } })
    expect(result).toMatchObject({ success: false, failure: { kind: 'business', code: 'application_storage_limit' }, refresh: false })
    expect(JSON.stringify(result)).not.toMatch(/private SQL|APP_PLATFORM_FAILURE/)
  })
  it('removes unclassified provider messages and diagnostic payloads', () => {
    const result = presentViewActionResult({ success: false, message: { en_US: 'private provider key=secret' },
      data: { internalPath: '/private/runtime' }, refresh: true })
    expect(result).toMatchObject({ success: false, refresh: false })
    expect(JSON.stringify(result)).not.toMatch(/private|secret|internalPath/)
  })
  it('retains explicitly classified business recovery', () => {
    const result: XpertViewActionResult = { success: false, failure: { kind: 'business', code: 'FILE_REQUIRED' },
      message: { en_US: 'Upload the original document first.' }, data: { recovery: 'upload-source' } }
    expect(presentViewActionResult(result)).toBe(result)
  })
  it('preserves normal business output', () => {
    const result = { success: true, data: { title: 'Proposal', status: 'ready' } }
    expect(presentViewActionResult(result)).toBe(result)
  })
  it('retains diagnostics with authoring visibility permission', () => {
    jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
    jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.ADMIN } })
    const result = { success: false, message: { en_US: 'operator diagnostic' } }
    expect(presentViewActionResult(result)).toBe(result)
  })
})
