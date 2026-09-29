import { TestBed } from '@angular/core/testing'
import { AssistantBindingScope, AssistantCode, IAssistantBinding, IXpert, XpertTypeEnum } from '@xpert-ai/contracts'
import { ClawXpertConfigurationCache, getClawXpertConfigurationCacheKey } from './clawxpert-configuration-cache.service'

const scope = { userId: 'user-1', organizationId: 'org-1' }
const preference: IAssistantBinding = {
  code: AssistantCode.CLAWXPERT,
  scope: AssistantBindingScope.USER,
  assistantId: 'xpert-1'
}
const xpert: IXpert = { id: 'xpert-1', name: 'ClawXpert', slug: 'clawxpert', type: XpertTypeEnum.Agent, latest: true }

describe('ClawXpertConfigurationCache', () => {
  let cache: ClawXpertConfigurationCache
  beforeEach(() => {
    localStorage.clear()
    TestBed.configureTestingModule({})
    cache = TestBed.inject(ClawXpertConfigurationCache)
  })
  afterEach(() => {
    jest.restoreAllMocks()
    localStorage.clear()
    TestBed.resetTestingModule()
  })

  it('persists only startup data and restores it through a new service instance', () => {
    cache.save(scope, preference, [
      {
        ...xpert,
        title: 'My assistant',
        starters: ['Hello'],
        features: {
          opener: { enabled: true, message: 'Welcome back', questions: ['Start a task'] },
          frequentQuestions: { enabled: true },
          suggestion: { enabled: false, prompt: '' },
          textToSpeech: { enabled: false },
          speechToText: { enabled: false }
        },
        avatar: { emoji: { id: 'wave' } },
        options: { workbench: { defaultViewKey: 'dashboard' } },
        copilotModel: { model: 'test-model', options: { apiKey: 'do-not-cache' } },
        draft: { team: { ...xpert }, nodes: [], connections: [] }
      }
    ])
    TestBed.resetTestingModule()
    cache = TestBed.inject(ClawXpertConfigurationCache)

    expect(cache.load(scope)?.xpert).toMatchObject({
      title: 'My assistant',
      starters: ['Hello'],
      features: {
        opener: { enabled: true, message: 'Welcome back', questions: ['Start a task'] },
        frequentQuestions: { enabled: true }
      },
      avatar: { emoji: { id: 'wave' } },
      options: { workbench: { defaultViewKey: 'dashboard' } },
      copilotModel: { model: 'test-model' }
    })
    const raw = localStorage.getItem(getClawXpertConfigurationCacheKey(scope))
    expect(raw).not.toContain('do-not-cache')
    expect(raw).not.toContain('draft')
  })

  it('isolates users and organizations and does not cache unknown owners', () => {
    cache.save(scope, preference, [xpert])
    expect(cache.load({ ...scope, userId: 'user-2' })).toBeNull()
    expect(cache.load({ ...scope, organizationId: 'org-2' })).toBeNull()
    expect(cache.load({ ...scope, userId: null })).toBeNull()
    cache.save({ ...scope, userId: null }, preference, [xpert])
    expect(localStorage.length).toBe(1)
  })

  it.each([
    '{broken',
    JSON.stringify({ version: 2, preference, xpert }),
    JSON.stringify({ version: 1, preference, xpert: { ...xpert, id: 'another-xpert' } }),
    JSON.stringify({ version: 1, preference, xpert: { ...xpert, latest: false } }),
    JSON.stringify({ version: 1, preference, xpert: { ...xpert, options: { workbench: { defaultViewKey: 42 } } } })
  ])('discards corrupt, incompatible or invalid snapshots (%s)', (raw) => {
    const key = getClawXpertConfigurationCacheKey(scope)
    localStorage.setItem(key, raw)
    expect(cache.load(scope)).toBeNull()
    expect(localStorage.getItem(key)).toBeNull()
  })

  it('removes an existing cache after unbinding or losing access to the bound assistant', () => {
    cache.save(scope, preference, [xpert])
    cache.save(scope, null, [xpert])
    expect(cache.load(scope)).toBeNull()
    cache.save(scope, preference, [xpert])
    cache.save(scope, preference, [])
    expect(cache.load(scope)).toBeNull()
  })

  it('continues without a cache when local storage cannot be read or written', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable')
    })
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded')
    })
    expect(cache.load(scope)).toBeNull()
    expect(() => cache.save(scope, preference, [xpert])).not.toThrow()
  })
})
