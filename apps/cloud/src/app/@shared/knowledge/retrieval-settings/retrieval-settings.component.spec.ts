import { By } from '@angular/platform-browser'
import { TestBed } from '@angular/core/testing'
import { KnowledgebaseService, ToastrService } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { of } from 'rxjs'
import { KnowledgeRetrievalSettingsComponent } from './retrieval-settings.component'

async function setup(weights: { vector: number; graph: number; keyword: number }) {
  const knowledgebase = {
    id: 'knowledgebase-1',
    recall: {
      fusion: {
        mode: 'weighted_rrf' as const,
        weights
      }
    },
    graphRag: {
      enabled: true,
      mode: 'hybrid' as const
    }
  }
  const knowledgebaseService = {
    update: jest.fn(() => of(knowledgebase))
  }
  const toastrService = {
    error: jest.fn()
  }

  TestBed.resetTestingModule()
  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), KnowledgeRetrievalSettingsComponent],
    providers: [
      { provide: KnowledgebaseService, useValue: knowledgebaseService },
      { provide: ToastrService, useValue: toastrService }
    ]
  }).compileComponents()

  const fixture = TestBed.createComponent(KnowledgeRetrievalSettingsComponent)
  fixture.componentRef.setInput('savable', true)
  const cva = fixture.debugElement.injector.get(NgxControlValueAccessor)
  cva.value$.set(knowledgebase)
  fixture.detectChanges()
  TestBed.flushEffects()
  fixture.detectChanges()

  return { fixture, knowledgebaseService, toastrService }
}

describe('KnowledgeRetrievalSettingsComponent', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('hides the legacy graph weight while weighted RRF is active', async () => {
    const { fixture } = await setup({ vector: 0.65, graph: 0.35, keyword: 0.3 })
    const sliderLabels = fixture.debugElement
      .queryAll(By.css('xp-slider-input'))
      .map(({ componentInstance }) => componentInstance.label)

    expect(fixture.componentInstance.rrfActive()).toBe(true)
    expect(sliderLabels).not.toContain('XP.Knowledgebase.GraphWeight')
    expect(sliderLabels).toContain('XP.Knowledgebase.RRFGraphWeight')

    fixture.destroy()
  })

  it('blocks saving and displays a warning when all RRF weights are zero', async () => {
    const { fixture, knowledgebaseService, toastrService } = await setup({ vector: 0, graph: 0, keyword: 0 })
    const component = fixture.componentInstance

    expect(component.rrfHasEnabledRetriever()).toBe(false)
    expect(fixture.debugElement.query(By.css('.ri-error-warning-line'))).not.toBeNull()
    expect(fixture.debugElement.query(By.css('.btn-primary')).nativeElement.disabled).toBe(true)

    component.saveRetrievalSettings()

    expect(knowledgebaseService.update).not.toHaveBeenCalled()
    expect(toastrService.error).toHaveBeenCalledWith('XP.Knowledgebase.RRFPositiveWeightRequired', '', {
      Default: 'RRF requires at least one retrieval source with a positive weight.'
    })

    fixture.destroy()
  })
})
