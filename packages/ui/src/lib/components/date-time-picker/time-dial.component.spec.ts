import { TestBed } from '@angular/core/testing'
import { ZardTimeDialComponent } from './time-dial.component'

describe('Zard time dial', () => {
  function create() {
    TestBed.configureTestingModule({ imports: [ZardTimeDialComponent] })
    const fixture = TestBed.createComponent(ZardTimeDialComponent)
    const changed = jest.fn((value: string) => fixture.componentRef.setInput('value', value))
    fixture.componentInstance.valueChange.subscribe(changed)
    fixture.componentRef.setInput('value', '17:37')
    fixture.detectChanges()
    const root: HTMLElement = fixture.nativeElement
    const dial = root.querySelector<HTMLElement>('[role="slider"]')!
    jest.spyOn(dial, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 260, 260))
    Object.defineProperties(dial, {
      setPointerCapture: { value: jest.fn() },
      hasPointerCapture: { value: () => true },
      releasePointerCapture: { value: jest.fn() }
    })
    const point = (type: string, degrees: number, radius: number) => {
      dial.dispatchEvent(
        Object.assign(
          new MouseEvent(type, {
            bubbles: true,
            button: 0,
            clientX: 130 + Math.sin((degrees * Math.PI) / 180) * radius,
            clientY: 130 - Math.cos((degrees * Math.PI) / 180) * radius
          }),
          { pointerId: 1 }
        )
      )
      fixture.detectChanges()
    }
    const select = (degrees: number, radius: number) => {
      point('pointerdown', degrees, radius)
      point('pointerup', degrees, radius)
    }
    return { fixture, dial, root, changed, point, select }
  }

  it('selects 24-hour inner and outer rings, then minutes without rounding to five-minute intervals', () => {
    const { fixture, dial, root, select, point, changed } = create()
    select(30, 68)
    expect(changed).toHaveBeenLastCalledWith('13:37')
    expect(dial.getAttribute('aria-valuemax')).toBe('59')
    expect(document.activeElement).toBe(dial)
    point('pointerdown', 30, 104)
    point('pointermove', 42, 104)
    point('pointerup', 42, 104)
    expect(changed).toHaveBeenLastCalledWith('13:07')
    root.querySelector<HTMLButtonElement>('button')!.click()
    fixture.detectChanges()
    select(0, 68)
    expect(changed).toHaveBeenLastCalledWith('00:07')
    root.querySelector<HTMLButtonElement>('button')!.click()
    fixture.detectChanges()
    select(0, 104)
    expect(changed).toHaveBeenLastCalledWith('12:07')
    select(354, 104)
    expect(changed).toHaveBeenLastCalledWith('12:59')
  })

  it('wraps keyboard increments and blocks pointer and keyboard changes when disabled', () => {
    const { fixture, dial, changed, select } = create()
    const key = (key: string) => {
      dial.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      fixture.detectChanges()
    }
    key('End')
    expect(changed).toHaveBeenLastCalledWith('23:37')
    key('ArrowUp')
    expect(changed).toHaveBeenLastCalledWith('00:37')
    key('ArrowLeft')
    expect(changed).toHaveBeenLastCalledWith('23:37')
    key('Enter')
    key('Home')
    key('ArrowDown')
    expect(changed).toHaveBeenLastCalledWith('23:59')
    fixture.componentRef.setInput('disabled', true)
    fixture.detectChanges()
    changed.mockClear()
    select(0, 104)
    key('ArrowUp')
    expect(changed).not.toHaveBeenCalled()
    expect(dial.getAttribute('tabindex')).toBe('-1')
  })
})
