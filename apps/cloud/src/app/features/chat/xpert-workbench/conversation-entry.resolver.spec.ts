import { Injector, runInInjectionContext } from '@angular/core'
import {
  ActivatedRouteSnapshot,
  convertToParamMap,
  RedirectCommand,
  Router,
  RouterStateSnapshot,
  UrlTree
} from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import type { ChatConversationEntry } from '@xpert-ai/contracts'
import { firstValueFrom, isObservable, of, throwError } from 'rxjs'
import { ChatConversationService, Store } from '../../../@core'
import { resolveConversationEntry } from './conversation-entry.resolver'

describe('conversation entry resolver', () => {
  const service = { getEntryByThreadId: jest.fn() }
  const store = { organizationId: 'org', hasFeatureEnabled: jest.fn(() => true) }
  const router = { createUrlTree: jest.fn(() => new UrlTree()) }
  const entry: ChatConversationEntry = {
    id: 'group',
    threadId: 'thread',
    xpertId: 'assistant',
    title: 'Group',
    purpose: 'group'
  }
  let injector: Injector
  beforeEach(() => {
    jest.clearAllMocks()
    service.getEntryByThreadId.mockReturnValue(of(entry))
    store.hasFeatureEnabled.mockReturnValue(true)
    injector = Injector.create({
      providers: [
        { provide: ChatConversationService, useValue: service },
        { provide: Store, useValue: store },
        { provide: Router, useValue: router },
        { provide: TranslateService, useValue: { instant: () => 'Conversation unavailable' } }
      ]
    })
  })
  async function resolve(threadId?: string) {
    const route = { paramMap: convertToParamMap(threadId ? { threadId } : {}) } as ActivatedRouteSnapshot
    const result = runInInjectionContext(injector, () => resolveConversationEntry(route, {} as RouterStateSnapshot))
    return isObservable(result) ? firstValueFrom(result) : result
  }

  it('resolves the server purpose with the current organization before chat mounts', async () => {
    expect(await resolve('thread')).toEqual({ entry, organizationId: 'org', error: null })
    expect(service.getEntryByThreadId).toHaveBeenCalledWith('thread', 'org')
  })
  it('allows group members without the personal ClawXpert feature', async () => {
    store.hasFeatureEnabled.mockReturnValue(false)
    expect(await resolve('thread')).toMatchObject({ entry, error: null })
    expect(router.createUrlTree).not.toHaveBeenCalled()
  })
  it('preserves the personal feature gate for private conversations', async () => {
    store.hasFeatureEnabled.mockReturnValue(false)
    service.getEntryByThreadId.mockReturnValue(of({ ...entry, purpose: 'private' }))
    expect(await resolve('thread')).toBeInstanceOf(RedirectCommand)
    expect(router.createUrlTree).toHaveBeenCalledWith(['/chat'])
  })
  it('keeps new private conversations behind the feature gate without fetching a thread', async () => {
    store.hasFeatureEnabled.mockReturnValue(false)
    expect(await resolve()).toBeInstanceOf(RedirectCommand)
    expect(service.getEntryByThreadId).not.toHaveBeenCalled()
  })
  it('does not fetch metadata for a new conversation', async () => {
    expect(await resolve()).toEqual({ entry: null, organizationId: 'org', error: null })
    expect(service.getEntryByThreadId).not.toHaveBeenCalled()
  })
  it('fails closed on entry authorization errors without selecting a private adapter', async () => {
    service.getEntryByThreadId.mockReturnValue(throwError(() => new Error('Membership required')))
    expect(await resolve('thread')).toMatchObject({ entry: null, organizationId: 'org', error: expect.any(String) })
  })
})
