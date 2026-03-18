
import { Component, ElementRef, HostBinding, HostListener, ViewChild, computed, effect, inject, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { PropertyMeasure, QueryReturn, formatting, getEntityProperty, indicatorFormatter } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { AbstractStoryWidget, Intent, WidgetMenu, WidgetMenuType, replaceParameters } from '@metad/core'
import { Observable, debounceTime, map, tap } from 'rxjs'
import { TextDataService } from './text-data.service'

export interface TextWidgetOptions {
  text?: string
  intent?: Intent
}

@Component({
  standalone: true,
  imports: [TranslateModule],
  selector: 'ngm-story-widget-text',
  templateUrl: './text.component.html',
  styleUrls: ['./text.component.scss'],
  providers: [TextDataService]
})
export class NxWidgetTextComponent extends AbstractStoryWidget<TextWidgetOptions> {
  private readonly dataService = inject(TextDataService)

  get intent() {
    return this.options?.intent
  }

  @HostBinding('class.ngm-intent-navigation')
  get intentNavigation() {
    return !!this.intent?.semanticObject
  }
 
  readonly textSpan = viewChild('textSpan', { read: ElementRef<HTMLSpanElement> })

  public readonly preview = signal(false)
  public readonly contentSignal = computed(() => this.optionsSignal()?.text)
  private readonly measures = computed(() => {
    const content = this.contentSignal()
    const _indicators = []
    const myRegexp = new RegExp('\\[#(.*?)\\]', 'g')
    let match = myRegexp.exec(content)
    while (match !== null) {
      _indicators.push(match[1])
      match = myRegexp.exec(content)
    }

    return _indicators
  })

  private readonly results = toSignal(
    this.dataService.selectResult().pipe(
      tap((result) => this.setExplains(result.data)),
      map((result) => {
        const measures = {}
        result.data.forEach((result: QueryReturn<unknown> & { measure?: string }) => {
          const name = result.measure
          if (result.data?.[0]) {
            const property = getEntityProperty(this.entityType(), name)
            measures[name] = formatting((result.data[0] as any)[name], (<PropertyMeasure>property).formatting)
          } else {
            measures[name] = 'Error'
          }
        })
        return measures
      })
    ),
    { initialValue: {} }
  )

  public readonly content = computed(() => {
    let content = this.contentSignal()
    const results = this.results()
    // 替换指标 ID => 实际值
    if (this.preview() || !this.editableSignal()) {
      content = replaceParameters(content, this.entityType())
      Object.keys(results).forEach((name) => {
        content = content.replace(indicatorFormatter(name), results[name])
      })
    }

    return content
  })

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private dataSettingsSub = this.dataSettings$.pipe(takeUntilDestroyed()).subscribe(
    (dataSettings) => {
      this.dataService.dataSettings = dataSettings
    }
  )
  private serviceSub = this.dataService
    .onAfterServiceInit()
    .pipe(takeUntilDestroyed())
    .subscribe(() => {
      this.refresh()
    })
  private readonly entityTypeSub = this.dataService
    .selectEntityType()
    .pipe(takeUntilDestroyed())
    .subscribe((entityType) => {
      this.entityType.set(entityType)
    })
  private slicersSub = this.selectOptions$.pipe(takeUntilDestroyed()).subscribe((selectOptions) => {
    this.dataService.slicers = selectOptions
    this.refresh()
  })
  private menuActionSub = this.menuClick$.subscribe((event) => {
    if (event?.key === 'preview') {
      this.preview.set(!this.preview())
    }
  })

  constructor() {
    super()

    effect(() => {
      if (this.preview() || !this.editable) {
        this.dataService.setMeasures(this.measures())
      }
    })

    effect(() => {
      if (this.textSpan()) {
        this.textSpan().nativeElement.innerText = this.content() ?? (this.editableSignal() ? this.getTranslation('Story.Widgets.Common.InsertText', 'Insert text...') : '')
      }
    })
  }

  selectMenus(): Observable<WidgetMenu[]> {
    return this.editable$.pipe(
      map((editable) => {
        return editable
          ? [
              {
                key: 'preview',
                icon: 'preview',
                name: this.getTranslation('Story.Widgets.Common.Preview', 'Preview'),
                type: WidgetMenuType.Toggle
              }
            ]
          : []
      })
    )
  }
  
  refresh(force = false) {
    this.dataService.refresh(force)
  }

  readonly onTextChange = this.effect((event$: Observable<Event>) => {
    return event$.pipe(
      debounceTime(1000),
      tap((event: Event) => {
        this.updater((state, event: Event) => {
          state.options = state.options ?? {}
          state.options.text = (<HTMLElement>event.target).innerText
        })(event)
      })
    )
  })

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent) {
    if (this.intentNavigation) {
      this.coreService.sendIntent(this.intent)
    }
  }
}
