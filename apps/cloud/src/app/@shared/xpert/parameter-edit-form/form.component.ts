import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatInputModule } from '@angular/material/input'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { TXpertParameter, XpertParameterTypeEnum } from '../../../@core'
import { XpertParameterMenuItemComponent } from '../parameter-menu/menu-item.component'
import { XpertParameterIconComponent } from '../parameter-icon/icon.component'

@Component({
  standalone: true,
  selector: 'xpert-parameter-form',
  templateUrl: './form.component.html',
  styleUrl: 'form.component.scss',
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    CdkMenuModule,
    CdkListboxModule,
    DragDropModule,
    MatTooltipModule,
    MatSlideToggleModule,
    MatInputModule,

    NgmDensityDirective,
    XpertParameterMenuItemComponent,
    XpertParameterIconComponent
  ],

  hostDirectives: [NgxControlValueAccessor]
})
export class XpertParameterFormComponent {
  eXpertParameterTypeEnum = XpertParameterTypeEnum
  eDisplayBehaviour = DisplayBehaviour

  protected cva = inject<NgxControlValueAccessor<TXpertParameter | null>>(NgxControlValueAccessor)

  readonly type = computed(() => this.cva.value$()?.type)
  readonly name = computed(() => this.cva.value$()?.name)
  readonly title = computed(() => this.cva.value$()?.title)
  readonly description = computed(() => this.cva.value$()?.description)
  readonly optional = computed(() => this.cva.value$()?.optional)
  readonly options = computed(() => this.cva.value$()?.options)
  readonly maximum = computed(() => this.cva.value$()?.maximum)
  readonly item = computed(() => this.cva.value$()?.item ?? [])
  readonly itemKeys = computed(() => Object.keys(this.item()))

  updateParameter(name: keyof TXpertParameter, value: unknown) {
    this.cva.value$.update((state) => ({ ...(state ?? {}), [name]: value }) as TXpertParameter)
  }

  drop(event: CdkDragDrop<string, string>) {
    const options = Array.from(this.options() ?? [])
    moveItemInArray(options, event.previousIndex, event.currentIndex)
    this.updateParameter('options', options)
  }

  addOption() {
    const options = Array.from(this.options() ?? [])
    this.updateParameter('options', [...options, ''])
  }

  setOption(j: number, value: string) {
    this.options()[j] = value
    this.updateParameter('options', [...this.options()])
  }

  deleteOption(j: number) {
    const options = Array.from(this.options() ?? [])
    options.splice(j)
    this.updateParameter('options', options)
  }

  addParameter(param: Partial<TXpertParameter>) {
    const item = Array.from(this.item())
    item.push(param as TXpertParameter)
    this.updateParameter('item', item)
  }

  updateItem(index: number, value: TXpertParameter) {
    this.cva.value$.update((state) => {
      const item = state.item ?? []
      item[index] = value
      return {
        ...(state ?? {}),
        item: [...item]
      } as TXpertParameter
    })
  }

  updateArrayParameter(index: number, name: string, value: unknown) {
    this.cva.value$.update((state) => {
      const item = state.item ?? []
      item[index] = {
        ...item[index],
        [name]: value
      }
      return {
        ...(state ?? {}),
        item: [...item]
      } as TXpertParameter
    })
  }

  deleteArrayParameter(index: number) {
    this.cva.value$.update((state) => {
      const item = state.item ?? []
      item.slice(index, 1)
      return {
        ...(state ?? {}),
        item: [...item]
      } as TXpertParameter
    })
  }
}
