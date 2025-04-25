import { BooleanInput, coerceBooleanProperty } from '@angular/cdk/coercion'
import { ComponentPortal } from '@angular/cdk/portal'
import {
  ChangeDetectorRef,
  Component,
  Injector,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ViewContainerRef,
  computed,
  effect,
  inject,
  model,
  signal
} from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { MatTabGroup } from '@angular/material/tabs'
import { nonNullable } from '@metad/core'
import { debounceTime, filter, map } from 'rxjs/operators'
import { STORY_DESIGNER_FORM, STORY_DESIGNER_LIVE_MODE, STORY_DESIGNER_SCHEMA } from '../types'
import { NxSettingsPanelService } from './settings-panel.service'

@Component({
  selector: 'ngm-settings-panel',
  templateUrl: './settings-panel.component.html',
  styleUrls: ['./settings-panel.component.scss'],
  host: {
    class: 'ngm-settings-panel'
  }
})
export class NgmSettingsPanelComponent implements OnChanges {
  public settingsService = inject(NxSettingsPanelService)
  private _cdr = inject(ChangeDetectorRef)
  private _viewContainerRef = inject(ViewContainerRef)
  protected injector = inject(Injector)

  readonly opened = model<boolean>(false)

  @Input()
  get liveMode(): boolean {
    return this._liveMode
  }
  set liveMode(value: BooleanInput) {
    this._liveMode = coerceBooleanProperty(value)
    this.settingsService.liveMode = this._liveMode
  }
  private _liveMode = false

  @ViewChild('tabGroup') tabGroup: MatTabGroup

  settingsPortal: ComponentPortal<unknown>

  readonly settingsPortals = signal<Array<{ icon?: string; label: string; portal: ComponentPortal<unknown> }>>(null)
  readonly tabPortalIndex = signal<number>(null)
  readonly tabPortal = computed(() => this.settingsPortals()?.[this.tabPortalIndex()])

  /**
   * Second auxiliary panel
   */
  readonly drawerOpened = model<boolean>(false)
  drawerPortal: ComponentPortal<unknown>
  drawerTitle: string

  private editable = toSignal(this.settingsService.editable$)

  // Subscribers
  private _settingsComponentSub = this.settingsService.settingsComponent$
    .pipe(
      debounceTime(100),
      filter(nonNullable),
      map((settingsComponent) => {
        if (!settingsComponent.settingsPortals) {
          if (settingsComponent.components) {
            settingsComponent.settingsPortals = settingsComponent.components.map(
              ({ icon, label, component, schema, model, submit }) => {
                const injector = Injector.create({
                  providers: [
                    [
                      {
                        provide: STORY_DESIGNER_FORM,
                        useValue: {
                          model,
                          submit
                        }
                      }
                    ]
                  ],
                  parent: this.injector
                })

                const injector2 = Injector.create({
                  providers: [
                    [
                      ...(schema
                        ? [
                            {
                              provide: STORY_DESIGNER_SCHEMA,
                              useClass: schema
                            }
                          ]
                        : []),
                      {
                        provide: STORY_DESIGNER_LIVE_MODE,
                        useValue: settingsComponent.liveMode ?? this.liveMode
                      }
                    ]
                  ],
                  parent: injector
                })

                return {
                  icon,
                  label,
                  portal: new ComponentPortal(component, null, injector2)
                }
              }
            )
          } else {
            const injector = Injector.create({
              providers: [
                [
                  {
                    provide: STORY_DESIGNER_FORM,
                    useValue: settingsComponent
                  }
                ]
              ],
              parent: this.injector
            })

            const injector2 = Injector.create({
              providers: [
                [
                  ...(settingsComponent.schema
                    ? [
                        {
                          provide: STORY_DESIGNER_SCHEMA,
                          useClass: settingsComponent.schema
                        }
                      ]
                    : []),
                  {
                    provide: STORY_DESIGNER_LIVE_MODE,
                    useValue: settingsComponent.liveMode ?? this.liveMode
                  }
                ]
              ],
              parent: injector
            })

            settingsComponent.settingsPortals = new ComponentPortal(
              settingsComponent.container,
              this._viewContainerRef,
              injector2
            )
          }
        }

        return settingsComponent
      }),
      filter(nonNullable),
      takeUntilDestroyed()
    )
    .subscribe(({ settingsPortals, drawer, title }) => {
      if (drawer) {
        this.drawerOpened.set(true)
        this.drawerPortal = settingsPortals as ComponentPortal<unknown>
        this.drawerTitle = title
      } else {
        this.drawerOpened.set(false)
        this.drawerPortal = null
        if (Array.isArray(settingsPortals)) {
          this.settingsPortal = null
          this.settingsPortals.set(settingsPortals)
          this.tabPortalIndex.set(0)
        } else {
          this.settingsPortal = settingsPortals
          this.settingsPortals.set(null)
        }
      }

      this._cdr.markForCheck()
      this._cdr.detectChanges()
    })

  private _closeSub = this.settingsService.close$.pipe(takeUntilDestroyed()).subscribe(() => {
    if (this.drawerOpened()) {
      this.closeDrawer()
    } else {
      this.opened.set(false)
    }
    this._cdr.detectChanges()
  })

  constructor() {
    effect(
      () => {
        this.opened.set(this.editable())
      },
      { allowSignalWrites: true }
    )
  }

  ngOnChanges({ opened }: SimpleChanges): void {
    if (opened) {
      this.settingsService.setEditable(opened.currentValue)
      if (!opened.currentValue) {
        this.closeDrawer()
      }
    }
  }

  closeDrawer() {
    this.drawerOpened.set(false)
  }

  submitDrawer() {
    this.settingsService.drawerSubmit$.next(false)
    this.closeDrawer()
  }

  onResize() {
    this.tabGroup?.realignInkBar()
  }

  remove() {
    this.settingsService.drawerSubmit$.next(true)
    this.closeDrawer()
  }
}
