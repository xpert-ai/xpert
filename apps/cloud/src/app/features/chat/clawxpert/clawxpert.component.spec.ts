import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { provideRouter } from '@angular/router'
import { ClawXpertComponent } from './clawxpert.component'

describe('ClawXpertComponent', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [ClawXpertComponent],
      providers: [provideRouter([])]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('renders the router outlet shell for nested ClawXpert pages', () => {
    const fixture = TestBed.createComponent(ClawXpertComponent)
    fixture.detectChanges()

    expect(fixture.debugElement.query(By.css('router-outlet'))).not.toBeNull()
  })
})
