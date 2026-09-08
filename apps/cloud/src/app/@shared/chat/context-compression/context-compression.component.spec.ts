import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { ChatContextCompressionChunkComponent } from './context-compression.component'

jest.mock('@cloud/app/@core', () => ({ resolveI18nText: (value: unknown) => value }))

describe('context compression status', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ChatContextCompressionChunkComponent],
      providers: [{ provide: TranslateService, useValue: { currentLang: 'en' } }]
    }).overrideComponent(ChatContextCompressionChunkComponent, {
      set: { template: '{{ labelDefault() }}', imports: [] }
    })
  })

  it.each(['no_token_gain', 'no_unprotected_history', 'summary_invalid', 'summary_constraints_lost'])(
    'renders failure instead of no-op for %s',
    (reason) => {
      const fixture = TestBed.createComponent(ChatContextCompressionChunkComponent)
      fixture.componentRef.setInput('chunk', { status: 'fail', reason })
      fixture.detectChanges()
      expect(fixture.nativeElement.textContent).toContain('Context compression failed')
      expect(fixture.componentInstance.iconClass()).toBe('ri-error-warning-line')
    }
  )

  it('retains the no-op label when compression successfully skips absent history', () => {
    const fixture = TestBed.createComponent(ChatContextCompressionChunkComponent)
    fixture.componentRef.setInput('chunk', { status: 'success', reason: 'no_messages' })
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('Context not compressed')
  })
})
