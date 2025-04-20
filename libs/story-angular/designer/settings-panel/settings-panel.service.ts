import { ComponentPortal } from '@angular/cdk/portal'
import { Injectable, Injector, ViewContainerRef, inject } from '@angular/core'
import { cloneDeep } from '@metad/ocap-core'
import { uuid } from '@metad/story/core'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, EMPTY, Observable, Subject, combineLatest, from, of } from 'rxjs'
import { distinctUntilChanged, filter, map, startWith, switchMap, takeUntil, tap } from 'rxjs/operators'
import { DesignerComponentProvider, DesignerComponentType, STORY_DESIGNER_COMPONENT, SettingsComponent } from '../types'

interface LocalSettingsComponent extends SettingsComponent {
  components: Array<DesignerComponentType<unknown>>
  settingsPortals?: ComponentPortal<unknown> | Array<{ icon?: string; label: string; portal: ComponentPortal<unknown> }>
  drawer?: boolean
  liveMode?: boolean
  title?: string
}

@Injectable()
export class NxSettingsPanelService {
  private _viewContainerRef = inject(ViewContainerRef)
  protected injector = inject(Injector)
  private components?: Array<DesignerComponentProvider> = inject(STORY_DESIGNER_COMPONENT, { optional: true })
  protected logger? = inject(NGXLogger, { optional: true })

  // public readonly opened$ = signal(false)

  liveMode: boolean

  drawerSubmit$ = new Subject<boolean>()

  private _settingsComponents: { [key: string]: LocalSettingsComponent } = {}

  /**
   * @deprecated Why need editable?
   */
  private _editable$ = new BehaviorSubject<boolean>(false)
  /**
   * @deprecated Why need editable?
   */
  readonly editable$ = this._editable$.asObservable().pipe(distinctUntilChanged())

  get settingsComponent() {
    return this._settingsComponent$.value
  }
  private _settingsComponent$ = new BehaviorSubject<LocalSettingsComponent>(null)
  public settingsComponent$ = combineLatest([this._settingsComponent$, this._editable$]).pipe(
    filter(([, editable]) => editable),
    map(([settingsComponent]) => {
      if (!settingsComponent) {
        return null
      }

      this._settingsComponents[settingsComponent.id] = settingsComponent
      return this._settingsComponents[settingsComponent.id]
    })
  )

  public readonly close$ = new Subject<void>()
  public readonly closeMinor$ = new Subject<void>()

  setEditable(value: boolean) {
    this._editable$.next(value)
  }

  observe(componentType: any) {
    const componentProvider = this.components.find((item) => item.type === componentType)

    if (!componentProvider) {
      console.error(`Can't found componentProvider for ${componentType}`)
      return EMPTY
    }

    return of(componentProvider).pipe(
      switchMap((componentProvider) => {
        if (componentProvider.schema) {
          return of(componentProvider.schema)
        }
        if (componentProvider.factory) {
          return from(componentProvider.factory())
        }

        return of(null)
      }),
      map((schema) => ({
        ...componentProvider,
        schema
      }))
    )
  }

  openDesigner<T>(componentType: any, model: T | Observable<T>, id?: string | number): Observable<T> {
    const componentProvider = this.components.find((item) => item.type === componentType)

    if (!componentProvider) {
      console.error(`Can't found componentProvider for ${componentType}`)
      return EMPTY
    }

    return of(componentProvider).pipe(
      switchMap((componentProvider) => {
        if (componentProvider.schema) {
          return of(componentProvider.schema)
        }
        if (componentProvider.factory) {
          return from(componentProvider.factory())
        }

        return of(null)
      }),
      map((schema) => ({
        ...componentProvider,
        schema
      })),
      switchMap((componentProvider) => {
        const settingsComponent =
          this._settingsComponents[id] ||
          ({
            id: id || uuid(),
            container: componentProvider.component,
            schema: componentProvider.schema,
            submit: new Subject<T>(),
            liveMode: this.liveMode
          } as LocalSettingsComponent)

        settingsComponent.model = model as any

        this._settingsComponent$.next(settingsComponent)

        return settingsComponent.submit.pipe(map((model) => cloneDeep(model)))
      })
    )
  }

  /**
   * model 必须提供初始值(非 null)才行. 这个需要修正
   *
   * @param id
   * @param tabs
   * @returns
   */
  openTabsDesigner<T>(id: string, tabs: Array<DesignerComponentType<any>>) {
    return (
      this._settingsComponents[id]
        ? of(this._settingsComponents[id])
        : combineLatest(
            tabs.map(({ componentType, label, icon, model }, i) => {
              return this.observe(componentType).pipe(
                map((componentProvider) => ({
                  icon: componentProvider.icon ?? icon,
                  label,
                  component: componentProvider.component,
                  model,
                  schema: componentProvider.schema,
                  submit: new Subject()
                }))
              )
            })
          ).pipe(
            map((components) => {
              return {
                id: id || uuid(),
                components,
                liveMode: this.liveMode
              } as LocalSettingsComponent
            })
          )
    ).pipe(
      tap((settingsComponent) => {
        this._settingsComponent$.next(settingsComponent)
      }),
      switchMap(({ components }) =>
        combineLatest(
          components.map(({ submit }) => {
            return submit.pipe(
              startWith(null),
              map((model) => cloneDeep(model))
            )
          })
        )
      )
    ) as Observable<any>
  }

  /**
   *
   * @param componentType
   * @param model
   * @param title
   * @returns
   */
  openSecondDesigner<T>(componentType: string, model: T, title?: string, liveMode?: boolean): Observable<T> {
    // 终止之前所有的次设计器
    this.closeMinor$.next()
    return this.observe(componentType).pipe(
      switchMap((componentProvider) => {
        const settingsComponent = {
          id: uuid(),
          container: componentProvider.component,
          schema: componentProvider.schema,
          submit: new Subject<T>(),
          drawer: true,
          liveMode: true,
          transition: null,
          title
        } as LocalSettingsComponent

        settingsComponent.model = model as any

        this._settingsComponent$.next(settingsComponent)

        return settingsComponent.submit.pipe(
          startWith(null),
          switchMap((model) => {
            return liveMode
              ? this.drawerSubmit$.pipe(
                  startWith(null),
                  map((clear) => {
                    // 实际的 Model 值要放在对象里, 以此与 null 分开来判断是否是删除当前值
                    return clear ? {} : cloneDeep(model)
                  })
                )
              : this.drawerSubmit$.pipe(
                  map((clear) => {
                    // 实际的 Model 值要放在对象里, 以此与 null 分开来判断是否是删除当前值
                    return clear ? {} : cloneDeep(model)
                  })
                )
          }),
          // 终止设计器
          takeUntil(this.closeMinor$)
        )
      })
    )
  }

  close() {
    this.close$.next()
  }
}
