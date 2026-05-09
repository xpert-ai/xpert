import { ComponentFixture, TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'

import { XpertVariableFormComponent } from './variable-form.component'

describe('XpertVariableFormComponent', () => {
  let fixture: ComponentFixture<XpertVariableFormComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), XpertVariableFormComponent]
    }).compileComponents()

    fixture = TestBed.createComponent(XpertVariableFormComponent)
    fixture.detectChanges()
  })

  it('uses z-select controls for variable type and reducer fields', () => {
    const nativeElement = fixture.nativeElement as HTMLElement

    expect(nativeElement.querySelectorAll('z-select')).toHaveLength(2)
    expect(nativeElement.querySelector('ngm-select')).toBeNull()
  })
})
