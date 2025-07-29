import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { attrModel, write } from '@metad/core'
import { linkedModel, NgmI18nPipe } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { assign, cloneDeep } from 'lodash-es'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { TXpertParameter, XpertParameterTypeEnum } from '../../../@core'
import { XpertParameterFormComponent } from '../parameter-edit-form/form.component'
import { XpertParameterIconComponent } from '../parameter-icon/icon.component'

type TXpertParameterAttr = {
  path: string[]
  param: TXpertParameter
  isNewLevel?: boolean
}

@Component({
  standalone: true,
  selector: 'xpert-parameter-input',
  templateUrl: './input.component.html',
  styleUrl: 'input.component.scss',
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    CdkMenuModule,
    DragDropModule,
    MatTooltipModule,
    NgmI18nPipe,
    XpertParameterIconComponent,
    XpertParameterFormComponent
  ],
  hostDirectives: [NgxControlValueAccessor]
})
export class XpertParameterInputComponent {
  eXpertParameterTypeEnum = XpertParameterTypeEnum
  eDisplayBehaviour = DisplayBehaviour

  protected cva = inject<NgxControlValueAccessor<TXpertParameter | null>>(NgxControlValueAccessor)

  readonly value$ = linkedModel({
    initialValue: null,
    compute: () => this.cva.value$(),
    update: (value) => {
      this.cva.value$.set(cloneDeep(value))
    }
  })

  readonly removed = output<void>()

  readonly type = attrModel(this.value$, 'type')
  readonly name = attrModel(this.value$, 'name')
  readonly title = attrModel(this.value$, 'title')

  readonly attributes = computed(() => {
    return this.value$() ? expandAttributes(this.value$()) : []
  })

  constructor() {
    effect(() => {
      // console.log(this.attributes(), this.value$())
    })
  }

  addAttr(item: TXpertParameterAttr) {
    this.value$.update(
      write((state) => {
        updateParameterByPath(state, item.path, (param) => {
          param.item ??= []
          if (!param.item.some((child) => !child.name)) {
            param.item.push({ type: XpertParameterTypeEnum.STRING, name: '' } as TXpertParameter)
          }
        })
        return state
      })
    )
  }

  updateAttr(item: TXpertParameterAttr, value: Partial<TXpertParameter>) {
    this.value$.update(
      write((state) => {
        updateParameterByPath(state, item.path, (param) => {
          assign(param, value)
        })
        return state
      })
    )
  }

  deleteParameter(item: TXpertParameterAttr) {
    if (item.path.length === 1) {
      this.removed.emit()
    } else {
      this.value$.update(
        write((state) => {
          const parent = item.path.slice(0, -1)
          const lastKey = item.path[item.path.length - 1]
          updateParameterByPath(state, parent, (param) => {
            if (param.item) {
              const index = param.item.findIndex((child) => child.name === lastKey || (!child.name && !lastKey))
              if (index !== -1) {
                param.item.splice(index, 1)
              }
            }
          })
          return state
        })
      )
    }
  }
}

function expandAttributes(
  param: TXpertParameter,
  path: string[] = [],
  seen: Set<string> = new Set()
): TXpertParameterAttr[] {
  const currentPath = [...path, param.name ?? '']

  // 路径标识字符串，用于唯一追踪层级（不包含最后的字段名）
  const prefix = currentPath.slice(0, -1).join('.')

  // 是否是新层级（首次出现的路径前缀）
  const isNewLevel = !seen.has(prefix)
  if (isNewLevel && prefix) {
    seen.add(prefix)
  }

  const attrs: TXpertParameterAttr[] = [{ path: currentPath, param: { ...param }, isNewLevel }]
  if (param.name && param.type === XpertParameterTypeEnum.OBJECT && Array.isArray(param.item)) {
    param.item.forEach((child) => attrs.push(...expandAttributes(child, currentPath, seen)))
  }

  if (param.name && param.type === XpertParameterTypeEnum.ARRAY && Array.isArray(param.item)) {
    param.item.forEach((child) => attrs.push(...expandAttributes(child, currentPath, seen)))
  }

  return attrs
}

function updateParameterByPath(
  param: TXpertParameter,
  path: string[],
  updater: (target: TXpertParameter) => void
): void {
  if (path.length === 0) {
    updater(param)
    return
  }

  const [head, ...rest] = path

  if (param.name !== head && !(!param.name && !head)) return

  if (rest.length === 0) {
    // 命中目标节点，执行更新
    updater(param)
    return
  }

  // object 或 array[object] 类型才能继续深入
  if (
    (param.type === XpertParameterTypeEnum.OBJECT || param.type === XpertParameterTypeEnum.ARRAY) &&
    Array.isArray(param.item)
  ) {
    const nextKey = rest[0]

    for (const child of param.item) {
      if (nextKey === '[*]' || child.name === nextKey || (!child.name && !nextKey)) {
        updateParameterByPath(child, rest, updater)
      }
    }
  }
}
