import { FocusOrigin } from '@angular/cdk/a11y'
import { CdkDragDrop } from '@angular/cdk/drag-drop'
import { Component, ViewChild, computed, effect, forwardRef, inject, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms'
import { AbstractStoryWidget, IStoryWidget, WidgetMenu, WidgetMenuType, replaceParameters } from '@metad/core'
import { EntitySchemaType } from '@metad/ocap-angular/entity'
import { PropertyMeasure, QueryReturn, formatting, getEntityProperty, indicatorFormatter } from '@metad/ocap-core'
import { EditorComponent } from '@tinymce/tinymce-angular'
import { Observable, firstValueFrom, map, startWith, tap } from 'rxjs'
import { DocumentDataService } from './document-data.service'

export interface NxWidgetDocumentOptions {
  content: string
}

const DOCUMENT_COMPONENT_VALUE_ACCESSOR = {
  provide: NG_VALUE_ACCESSOR,
  useExisting: forwardRef(() => NxWidgetDocumentComponent),
  multi: true
}

/**
 * * 支持从 EntitySet 上计算出 `@parameter` 的值
 */
@Component({
  standalone: false,
  selector: 'pac-story-widget-document',
  templateUrl: './document.component.html',
  styleUrls: ['./document.component.scss'],
  providers: [DOCUMENT_COMPONENT_VALUE_ACCESSOR, DocumentDataService]
})
export class NxWidgetDocumentComponent
  extends AbstractStoryWidget<NxWidgetDocumentOptions>
  implements ControlValueAccessor, IStoryWidget<NxWidgetDocumentOptions>
{
  private readonly dataService = inject(DocumentDataService)

  @ViewChild(EditorComponent) editorComponent!: EditorComponent

  public readonly preview = signal(false)
  public readonly focused = signal(false)

  public readonly placeholder$ = this.options$.pipe(
    startWith(null),
    map((options) => !options?.content)
  )

  public readonly contentSignal = computed(() => this.optionsSignal()?.content)

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
    // 替换指标 ID => 实际值
    if (this.preview() || !this.editableSignal()) {
      content = replaceParameters(content, this.entityType())
      Object.keys(this.results()).forEach((name) => {
        content = content.replace(indicatorFormatter(name), this.results()[name])
      })
    }

    return content
  })

  public readonly disabledSignal = computed(() => this.preview() || !this.editableSignal())

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private dataSettingsSub = this.dataSettings$.subscribe(
    (dataSettings) => (this.dataService.dataSettings = dataSettings)
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

  private onTouchedCallback = (value: any) => {
    //
  }
  private onChangeCallback = (value: any) => {
    //
  }

  constructor() {
    super()

    effect(() => {
      if (this.preview() || !this.editableSignal()) {
        this.dataService.setMeasures(this.measures())
        this.editorComponent?.setDisabledState(true)
      } else {
        this.editorComponent?.setDisabledState(false)
      }
    })
  }

  writeValue(obj: any): void {
    // this.data = obj
  }
  registerOnChange(fn: any): void {
    this.onChangeCallback = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouchedCallback = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    // this.editable = isDisabled
  }

  onchange(event) {
    if (!this.preview() && this.editableSignal()) {
      this.onChangeCallback?.(event.editor.getContent())
      this.optionsChange.emit({ content: event.editor.getContent() })
    }
  }

  refresh() {
    this.dataService.refresh(true)
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

  focus(origin?: FocusOrigin): void {
    this.focused.set(true)
    this.editorComponent?.editor.focus()
  }

  async start() {
    const placeholder = await firstValueFrom(
      this.translateService.get('Story.Widgets.Document.GetStarted', { Default: 'Get started' })
    )
    this.options = {
      ...this.options,
      content: placeholder
    }
  }

  drop(event: CdkDragDrop<Array<{ name: string }>>) {
    if (event.item.data.type === EntitySchemaType.Parameter) {
      this.editorComponent.editor.insertContent(`[@${event.item.data.name}]`)
    } else if (event.item.data.type === EntitySchemaType.IMeasure) {
      this.editorComponent.editor.insertContent(`[#${event.item.data.name}]`)
    }
  }
}
