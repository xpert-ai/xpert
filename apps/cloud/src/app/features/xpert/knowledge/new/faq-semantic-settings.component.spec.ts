import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { createFAQSemanticForm, FAQSemanticSettingsComponent } from './faq-semantic-settings.component'

describe('FAQ semantic creation parameters', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('renders both parameters with reactive input bindings and locks saved values', () => {
    TestBed.configureTestingModule({ imports: [FAQSemanticSettingsComponent, TranslateModule.forRoot()] })
    const fixture = TestBed.createComponent(FAQSemanticSettingsComponent)
    const form = createFAQSemanticForm()
    fixture.componentRef.setInput('form', form)
    fixture.detectChanges()
    expect(form.getRawValue()).toEqual({ threshold: 0.85, margin: 0.05 })
    const thumbs: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('[role=slider]')
    expect(thumbs.length).toBe(2)
    const threshold: HTMLInputElement = fixture.nativeElement.querySelector('#faq-semantic-threshold')
    const margin: HTMLInputElement = fixture.nativeElement.querySelector('#faq-semantic-margin')
    threshold.value = '0.85'
    threshold.dispatchEvent(new Event('input'))
    margin.value = '0.05'
    margin.dispatchEvent(new Event('input'))
    fixture.detectChanges()
    expect(form.getRawValue()).toEqual({ threshold: 0.85, margin: 0.05 })
    expect(form.valid).toBe(true)
    expect(thumbs[0].getAttribute('aria-valuenow')).toBe('0.85')
    expect(thumbs[1].getAttribute('aria-valuenow')).toBe('0.05')
    thumbs.forEach((thumb) => thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    fixture.detectChanges()
    expect(form.getRawValue()).toEqual({ threshold: 0.86, margin: 0.06 })
    expect(threshold.value).toBe('0.86')
    expect(margin.value).toBe('0.06')
    expect(form.dirty).toBe(true)
    form.disable()
    fixture.detectChanges()
    expect(threshold.disabled).toBe(true)
    expect(margin.disabled).toBe(true)
    thumbs.forEach((thumb) => {
      expect(thumb.getAttribute('aria-disabled')).toBe('true')
      thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(form.getRawValue()).toEqual({ threshold: 0.86, margin: 0.06 })
  })

  it('prefills creation defaults and still requires values after clearing', () => {
    const form = createFAQSemanticForm()
    expect(form.getRawValue()).toEqual({ threshold: 0.85, margin: 0.05 })
    expect(form.valid).toBe(true)
    form.setValue({ threshold: null, margin: null })
    expect(form.invalid).toBe(true)
  })
  it.each([0, -0.1, 2.1, NaN, Infinity])('rejects invalid margin %p', (margin) => {
    const form = createFAQSemanticForm()
    form.setValue({ threshold: 0.85, margin })
    expect(form.invalid).toBe(true)
  })
  it.each([-0.1, 1.1, NaN, Infinity])('rejects invalid threshold %p', (threshold) => {
    const form = createFAQSemanticForm()
    form.setValue({ threshold, margin: 0.05 })
    expect(form.invalid).toBe(true)
  })
  it('loads existing values read-only', () => {
    const form = createFAQSemanticForm(
      {
        indexMode: 'question_only',
        questionIndexMode: 'separate',
        negativeMatchMode: 'semantic',
        semanticThreshold: 0.9,
        semanticMargin: 0.1
      },
      true
    )
    expect(form.disabled).toBe(true)
    expect(form.getRawValue()).toEqual({ threshold: 0.9, margin: 0.1 })
  })
})
