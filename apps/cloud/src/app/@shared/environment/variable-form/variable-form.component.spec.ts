import { ComponentFixture, TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'

import { XpertEnvVariableFormComponent } from './variable-form.component'

describe('XpertEnvVariableFormComponent', () => {
  let fixture: ComponentFixture<XpertEnvVariableFormComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), XpertEnvVariableFormComponent]
    }).compileComponents()

    fixture = TestBed.createComponent(XpertEnvVariableFormComponent)
    fixture.detectChanges()
  })

  it('uses z-select for the environment variable type field', () => {
    const nativeElement = fixture.nativeElement as HTMLElement

    expect(nativeElement.querySelectorAll('z-select')).toHaveLength(1)
    expect(nativeElement.querySelector('ngm-select')).toBeNull()
  })
})
