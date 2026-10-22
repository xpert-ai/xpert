import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { ZardDatePickerComponent, ZardSelectComponent } from '@xpert-ai/headless-ui'
import { RetentionDateTimeComponent } from './retention-date-time.component'

describe('RetentionDateTimeComponent', () => {
  function setup() {
    const fixture = TestBed.configureTestingModule({
      imports: [RetentionDateTimeComponent, TranslateModule.forRoot()]
    }).createComponent(RetentionDateTimeComponent)
    fixture.componentRef.setInput('label', 'Start time')
    const change = jest.fn()
    fixture.componentInstance.registerOnChange(change)
    fixture.detectChanges()
    return { fixture, component: fixture.componentInstance, change }
  }

  it('uses Headless UI calendar and time selects and preserves local minute precision', () => {
    const { fixture, component, change } = setup()
    expect(
      fixture.nativeElement.querySelector('input[type="datetime-local"], input[type="date"], input[type="time"]')
    ).toBeNull()
    component.writeValue('2026-10-10T09:35')
    fixture.detectChanges()
    const calendar = fixture.debugElement.query(By.directive(ZardDatePickerComponent))
      .componentInstance as ZardDatePickerComponent
    const selects = fixture.debugElement.queryAll(By.directive(ZardSelectComponent))
    calendar.dateChange.emit(new Date(2026, 9, 12))
    expect(change).toHaveBeenLastCalledWith('2026-10-12T09:35')
    const hour = selects[0].componentInstance as ZardSelectComponent
    const minute = selects[1].componentInstance as ZardSelectComponent
    hour.zSelectionChange.emit('14')
    minute.zSelectionChange.emit('07')
    expect(change).toHaveBeenLastCalledWith('2026-10-12T14:07')
  })

  it('starts at midnight, propagates clear, and ignores disabled controls', () => {
    const { fixture, component, change } = setup()
    component.selectDate(new Date(2026, 9, 12))
    expect(change).toHaveBeenLastCalledWith('2026-10-12T00:00')
    component.selectDate(null)
    expect(change).toHaveBeenLastCalledWith('')
    change.mockClear()
    component.setDisabledState(true)
    fixture.detectChanges()
    component.selectDate(new Date(2026, 9, 13))
    component.selectTime('hour', '12')
    expect(change).not.toHaveBeenCalled()
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true)
  })
})
