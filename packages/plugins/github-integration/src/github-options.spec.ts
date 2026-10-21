import { BadRequestException } from '@nestjs/common'
import { mergeGitHubIntegrationOptions } from './github-options'

describe('GitHub system integration settings', () => {
  const saved = {
    appId: '42',
    appSlug: 'review-app',
    clientId: 'client',
    clientSecret: 'client-fixture',
    privateKey: 'pem-fixture',
    webhookSecret: 'fixture'.repeat(8)
  }

  it('preserves saved secrets when a partial edit omits or blanks secret fields', () => {
    expect(
      mergeGitHubIntegrationOptions(saved, { appName: 'Renamed', privateKey: '', clientSecret: ' ', webhookSecret: '' })
    ).toEqual({ ...saved, appName: 'Renamed' })
    expect(mergeGitHubIntegrationOptions(saved, { appId: '43' })).toEqual({ ...saved, appId: '43' })
  })
  it('allows explicit rotation without changing other credentials', () => {
    expect(mergeGitHubIntegrationOptions(saved, { webhookSecret: 'new-fixture'.repeat(4) })).toEqual({
      ...saved,
      webhookSecret: 'new-fixture'.repeat(4)
    })
  })
  it('allows OAuth-only setup and an initially absent webhook secret', () => {
    expect(
      mergeGitHubIntegrationOptions(undefined, {
        clientId: 'client',
        clientSecret: 'fixture',
        appSlug: '',
        appId: '',
        webhookSecret: ''
      })
    ).toMatchObject({ clientId: 'client', clientSecret: 'fixture' })
  })
  it.each([
    { appId: 'Iv.client' },
    { appSlug: 'Display.Name' },
    { webhookSecret: 'short-fixture' },
    { unexpected: 'fixture' }
  ])('rejects invalid input without exposing submitted credentials', (patch) => {
    try {
      mergeGitHubIntegrationOptions(saved, patch)
      throw new Error('Expected rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException)
      expect(JSON.stringify(error)).not.toContain('fixture')
    }
  })
})
