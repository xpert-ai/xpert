import { AppPlatformStatus } from '@xpert-ai/contracts'
import { applicationReturnUrl } from './app-platform-navigation'

const status: AppPlatformStatus = {
  mode: 'managed-apps',
  branding: { name: 'Application' },
  platformKey: 'sample',
  version: 1,
  organizationId: 'organization',
  home: 'sample',
  ready: true,
  apps: [
    {
      key: 'sample',
      required: true,
      status: 'ready',
      entries: [{ key: 'assistant', id: 'assistant', slug: 'assigned', title: 'App' }]
    }
  ]
}
describe('application navigation after service recovery', () => {
  it.each([
    '/chat/x/assigned/p/project/c/thread?view=studio&viewSelection=record',
    '/project',
    '/project/11111111-1111-4111-8111-111111111111'
  ])('retains the complete business route %s', (url) => expect(applicationReturnUrl(url, status)).toBe(url))
  it.each([
    '//outside.example',
    '/\\outside.example',
    '/xpert',
    '/chat/x/unassigned/c/thread',
    '/chat/x/assigned-other',
    '/apps?returnUrl=/xpert',
    'https://outside.example',
    null
  ])('rejects an unassigned or external destination %s', (url) => expect(applicationReturnUrl(url, status)).toBeNull())
})
