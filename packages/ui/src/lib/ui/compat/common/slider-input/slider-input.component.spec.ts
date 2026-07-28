import { TestBed } from '@angular/core/testing'

import { XpSliderInputComponent } from './slider-input.component'

describe('XpSliderInputComponent', () => {
  it('keeps zero values written through the control value accessor', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [XpSliderInputComponent]
    }).createComponent(XpSliderInputComponent)

    fixture.componentRef.setInput('max', 10)
    fixture.componentRef.setInput('min', 0)
    fixture.detectChanges()

    fixture.componentInstance.writeValue(0)

    expect(fixture.componentInstance.model).toBe(0)
  })

  it('expands the maximum while auto scale is enabled', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [XpSliderInputComponent]
    }).createComponent(XpSliderInputComponent)

    fixture.componentRef.setInput('autoScale', true)
    fixture.componentRef.setInput('max', 10)
    fixture.detectChanges()
    fixture.componentInstance.currentMax.set(10)

    fixture.componentInstance.onSliderValueChange(10)

    expect(fixture.componentInstance.currentMax()).toBe(20)
  })
})
