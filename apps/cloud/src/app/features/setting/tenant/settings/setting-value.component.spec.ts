import { Clipboard } from '@angular/cdk/clipboard'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { SettingValueComponent } from './setting-value.component'

describe('SettingValueComponent', () => {
  const clipboard = { copy: jest.fn(() => true) }

  function setup(value: unknown) {
    const fixture = TestBed.configureTestingModule({
      imports: [SettingValueComponent, TranslateModule.forRoot()],
      providers: [{ provide: Clipboard, useValue: clipboard }]
    }).createComponent(SettingValueComponent)
    fixture.componentRef.setInput('value', value)
    fixture.componentRef.setInput('name', 'policy')
    fixture.componentRef.setInput('contentId', 'policy-value')
    fixture.detectChanges()
    return fixture
  }

  it('copies the entire formatted value even when its preview is collapsed', () => {
    const value = JSON.stringify({ enabled: true, nested: { items: [1, 2, 3, 4, 5] } })
    const fixture = setup(value)
    const element: HTMLElement = fixture.nativeElement
    const buttons = element.querySelectorAll('button')
    expect(element.querySelector('pre').textContent).toContain('…')
    buttons[1].click()
    expect(clipboard.copy).toHaveBeenCalledWith(JSON.stringify(JSON.parse(value), null, 2))
    buttons[0].click()
    fixture.detectChanges()
    expect(buttons[0].getAttribute('aria-expanded')).toBe('true')
    expect(element.querySelector('pre').textContent).toBe(JSON.stringify(JSON.parse(value), null, 2))
  })

  it.each([false, 0, 'false', '0', '{invalid JSON}', '<img src=x onerror=alert(1)>'])(
    'keeps %p literal and does not render HTML',
    (value) => {
      const fixture = setup(value)
      const element: HTMLElement = fixture.nativeElement
      expect(element.textContent).toContain(String(value))
      expect(element.querySelector('img')).toBeNull()
      expect(fixture.componentInstance.display().structured).toBe(false)
    }
  )
})
