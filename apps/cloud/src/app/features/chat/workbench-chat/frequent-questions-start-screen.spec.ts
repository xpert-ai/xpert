import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import type { IXpert } from '@xpert-ai/contracts'
import { BehaviorSubject } from 'rxjs'
import { Store } from '../../../@core/state/store.service'
import { injectFrequentQuestionsStartScreen } from './frequent-questions-start-screen'

describe('workbench automatic frequent questions', () => {
  const xpert = signal<IXpert | null>(null)
  const active = signal(true)
  let organization: BehaviorSubject<string | null>
  let http: HttpTestingController
  let startScreen: ReturnType<typeof injectFrequentQuestionsStartScreen>

  function expert(id = 'expert-1', enabled = true) {
    xpert.set({ id, features: { frequentQuestions: { enabled } } } as IXpert)
  }

  beforeEach(() => {
    xpert.set(null)
    active.set(true)
    organization = new BehaviorSubject<string | null>('org-1')
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, TranslateModule.forRoot()],
      providers: [
        {
          provide: Store,
          useValue: {
            organizationId: 'org-1',
            selectOrganizationId: () => organization
          }
        }
      ]
    })
    TestBed.inject(TranslateService).use('zh-Hans')
    http = TestBed.inject(HttpTestingController)
    startScreen = TestBed.runInInjectionContext(() => injectFrequentQuestionsStartScreen({ xpert, active }))
    TestBed.flushEffects()
  })

  afterEach(() => http.verify())

  function configuredExpert(automatic = true, questions = [' Export report ', 'export   report', 'Create report']) {
    xpert.set({
      id: 'expert-1',
      name: 'Reports',
      description: 'Report assistant',
      starters: ['Legacy question'],
      features: { opener: { enabled: true, message: 'Hello!!!', questions }, frequentQuestions: { enabled: automatic } }
    } as IXpert)
    TestBed.flushEffects()
  }

  it('shows the configured greeting and manual questions before automatic results and merges without duplicates', () => {
    configuredExpert()
    expect(startScreen()?.greeting).toBe('Hello!!!')
    expect(startScreen()?.prompts?.map((item) => item.prompt)).toEqual(['Export report', 'Create report'])
    http
      .expectOne((request) => request.url.includes('frequent-questions'))
      .flush({
        questions: ['EXPORT REPORT', 'Share report', 'Save report', 'Read report', 'Extra report']
      })
    expect(startScreen()?.greeting).toBe('Hello!!!')
    expect(startScreen()?.prompts?.map((item) => item.prompt)).toEqual([
      'Export report',
      'Create report',
      'Share report',
      'Save report',
      'Read report'
    ])
  })

  it.each([false, true])('preserves manual content when automatic results are empty or fail: %s', (fail) => {
    configuredExpert()
    const request = http.expectOne((request) => request.url.includes('frequent-questions'))
    if (fail) request.flush('Unavailable', { status: 503, statusText: 'Unavailable' })
    else request.flush({ questions: [] })
    expect(startScreen()?.greeting).toBe('Hello!!!')
    expect(startScreen()?.prompts).toHaveLength(2)
    active.set(false)
    TestBed.flushEffects()
    expect(startScreen()).toBeNull()
  })

  it('preserves more than five manual questions with automatic suggestions disabled', () => {
    configuredExpert(false, ['One', 'Two', 'Three', 'Four', 'Five', 'Six'])
    expect(startScreen()?.prompts).toHaveLength(6)
    expect(startScreen()?.greeting).toBe('Hello!!!')
    http.expectNone((request) => request.url.includes('frequent-questions'))
  })

  it('uses legacy starters and description when the opener is disabled, without requiring an organization', () => {
    organization.next(null)
    xpert.set({
      id: 'expert-1',
      description: 'Description',
      starters: ['Legacy'],
      features: { opener: { enabled: false, message: 'Hidden', questions: ['Hidden'] } }
    } as IXpert)
    TestBed.flushEffects()
    expect(startScreen()?.greeting).toBe('Description')
    expect(startScreen()?.prompts?.map((item) => item.prompt)).toEqual(['Legacy'])
  })

  it('does not generate for disabled experts, history, or a missing organization', () => {
    expert('expert-1', false)
    TestBed.flushEffects()
    expert()
    active.set(false)
    TestBed.flushEffects()
    active.set(true)
    organization.next(null)
    TestBed.flushEffects()
    expect(startScreen()).toBeNull()
    http.expectNone((request) => request.url.includes('frequent-questions'))
  })

  it('loads generated questions into ChatKit start-screen prompts', () => {
    expert()
    TestBed.flushEffects()
    const request = http.expectOne('/api/xpert/expert-1/frequent-questions?locale=zh-Hans')
    expect(request.request.method).toBe('GET')
    request.flush({ questions: ['How can I create a presentation?', 'How do I export it?'] })
    expect(startScreen()).toEqual({
      promptsLayout: 'list',
      prompts: [
        { label: 'How can I create a presentation?', prompt: 'How can I create a presentation?' },
        { label: 'How do I export it?', prompt: 'How do I export it?' }
      ]
    })
  })

  it('cancels previous requests when switching expert or organization', () => {
    expert()
    TestBed.flushEffects()
    const first = http.expectOne((request) => request.url.includes('expert-1/frequent-questions'))
    expert('expert-2')
    TestBed.flushEffects()
    expect(first.cancelled).toBe(true)
    const second = http.expectOne((request) => request.url.includes('expert-2/frequent-questions'))
    organization.next('org-2')
    TestBed.flushEffects()
    expect(second.cancelled).toBe(true)
    http.expectOne((request) => request.url.includes('expert-2/frequent-questions')).flush({ questions: ['New scope'] })
    expect(startScreen()?.prompts?.[0].prompt).toBe('New scope')
  })

  it('clears questions when disabled and does not block chat on generation errors', () => {
    expert()
    TestBed.flushEffects()
    http.expectOne((request) => request.url.includes('frequent-questions')).flush({ questions: ['Question'] })
    expert('expert-1', false)
    TestBed.flushEffects()
    expect(startScreen()).toBeNull()
    expert()
    TestBed.flushEffects()
    http
      .expectOne((request) => request.url.includes('frequent-questions'))
      .flush('Unavailable', {
        status: 503,
        statusText: 'Unavailable'
      })
    expect(startScreen()).toBeNull()
  })

  it('reloads in the selected language and clears generated prompts when entering history', () => {
    expert()
    TestBed.flushEffects()
    http.expectOne((request) => request.url.includes('frequent-questions')).flush({ questions: ['Question'] })
    TestBed.inject(TranslateService).use('en')
    TestBed.flushEffects()
    expect(startScreen()).toBeNull()
    http.expectOne('/api/xpert/expert-1/frequent-questions?locale=en').flush({ questions: [] })
    expect(startScreen()).toBeNull()
    active.set(false)
    TestBed.flushEffects()
    http.expectNone((request) => request.url.includes('frequent-questions'))
  })
})
