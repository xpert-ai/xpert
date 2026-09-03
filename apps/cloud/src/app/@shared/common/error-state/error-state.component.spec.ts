import { TestBed } from '@angular/core/testing'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ErrorStateComponent, toErrorStateViewModel } from './error-state.component'

describe('ErrorStateComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ErrorStateComponent]
    }).compileComponents()

    const translate = TestBed.inject(TranslateService)
    translate.setTranslation('en', {
      XP: {
        Common: {
          ErrorState: {
            Title: 'Something went wrong',
            Retry: 'Try again',
            TechnicalDetails: 'Technical details'
          }
        }
      }
    })
    translate.use('en')
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('presents a JSON string as a readable accessible error state', () => {
    const fixture = TestBed.createComponent(ErrorStateComponent)
    fixture.componentRef.setInput('error', '{"statusCode":500,"message":"Internal server error","requestId":"req-1"}')
    fixture.componentRef.setInput('title', 'Unable to load this view')
    fixture.componentRef.setInput('description', 'The remote component did not start.')
    fixture.detectChanges()

    const alert = fixture.nativeElement.querySelector('[data-error-state]') as HTMLElement
    const details = fixture.nativeElement.querySelector('[data-error-state-details]') as HTMLElement

    expect(alert.getAttribute('role')).toBe('alert')
    expect(alert.textContent).toContain('Unable to load this view')
    expect(fixture.nativeElement.querySelector('[data-error-state-status]').textContent.trim()).toBe('HTTP 500')
    expect(fixture.nativeElement.querySelector('[data-error-state-message]').textContent.trim()).toBe(
      'Internal server error'
    )
    expect(details.textContent).toContain('\n  "statusCode": 500,')
    expect(details.textContent).toContain('"requestId": "req-1"')
    expect(details.closest('details')?.open).toBe(false)
  })

  it('handles nested JSON strings and nested status codes', () => {
    const nestedJson = JSON.stringify(
      JSON.stringify({ error: { statusCode: 503, message: 'Service temporarily unavailable' } })
    )

    expect(toErrorStateViewModel(nestedJson)).toEqual({
      message: 'Service temporarily unavailable',
      statusLabel: 'HTTP 503',
      details: [
        '{',
        '  "error": {',
        '    "statusCode": 503,',
        '    "message": "Service temporarily unavailable"',
        '  }',
        '}'
      ].join('\n')
    })
  })

  it('emits retry only when the recovery action is enabled', () => {
    const fixture = TestBed.createComponent(ErrorStateComponent)
    const retry = jest.fn()
    fixture.componentInstance.retry.subscribe(retry)
    fixture.componentRef.setInput('error', 'Connection unavailable')
    fixture.componentRef.setInput('retryable', true)
    fixture.detectChanges()

    const retryButton = fixture.nativeElement.querySelector('[data-error-state-retry]') as HTMLButtonElement
    retryButton.click()

    expect(retry).toHaveBeenCalledTimes(1)
    expect(fixture.nativeElement.querySelector('[data-error-state-details]')).toBeNull()
  })
})
