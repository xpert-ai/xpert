import { ComponentFixture, TestBed } from '@angular/core/testing'
import { PinWidgetComponent } from './pin-widget.component'

describe('PinWidgetComponent', () => {
  let component: PinWidgetComponent
  let fixture: ComponentFixture<PinWidgetComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PinWidgetComponent],
      teardown: { destroyAfterEach: false }
    }).compileComponents()
  })

  beforeEach(() => {
    fixture = TestBed.createComponent(PinWidgetComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
