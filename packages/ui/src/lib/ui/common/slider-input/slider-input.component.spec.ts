import { TestBed } from '@angular/core/testing'

import { NgmSliderInputComponent } from './slider-input.component'

describe('NgmSliderInputComponent', () => {
  it('keeps zero values when written through the CVA API', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [NgmSliderInputComponent]
    }).createComponent(NgmSliderInputComponent)

    fixture.componentRef.setInput('max', 10)
    fixture.componentRef.setInput('min', 0)
    fixture.detectChanges()

    fixture.componentInstance.writeValue(0)

    expect(fixture.componentInstance.model).toBe(0)
  })

  it('expands max while autoScale is enabled', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [NgmSliderInputComponent]
    }).createComponent(NgmSliderInputComponent)

    fixture.componentRef.setInput('autoScale', true)
    fixture.componentRef.setInput('max', 10)
    fixture.detectChanges()

    fixture.componentInstance.onSliderValueChange(10)

    expect(fixture.componentInstance.currentMax()).toBe(20)
  })
})
