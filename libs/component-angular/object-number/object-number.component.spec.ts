import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing'
import { NxObjectNumberComponent } from './object-number.component'

describe('NxObjectNumberComponent', () => {
  let component: NxObjectNumberComponent
  let fixture: ComponentFixture<NxObjectNumberComponent>

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [NxObjectNumberComponent],
    }).compileComponents()
  }))

  beforeEach(() => {
    fixture = TestBed.createComponent(NxObjectNumberComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
