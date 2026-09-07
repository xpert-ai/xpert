import { TestBed } from '@angular/core/testing'
import { IconComponent } from './icon.component'

describe('IconComponent sizing', () => {
  it.each(['font', 'emoji', 'image', 'svg'])(
    'honors an explicit size for %s icons and falls back to their definition',
    async (type) => {
      await TestBed.configureTestingModule({ imports: [IconComponent] }).compileComponents()
      const fixture = TestBed.createComponent(IconComponent)
      fixture.componentRef.setInput('icon', { type, value: type === 'svg' ? '<svg></svg>' : 'example', size: 12 })
      fixture.componentRef.setInput('size', 24)
      fixture.detectChanges()
      const element: HTMLElement = fixture.nativeElement.querySelector(`.icon-${type}`)
      const property = type === 'font' || type === 'emoji' ? 'fontSize' : 'width'
      expect(element.style[property]).toBe('24px')
      fixture.componentRef.setInput('size', null)
      fixture.detectChanges()
      expect(element.style[property]).toBe('12px')
    }
  )
})
