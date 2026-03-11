import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { NgmSelectModule } from '@metad/ocap-angular/common'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { NgmEntityPropertyComponent } from '@metad/ocap-angular/entity'
import { OrderDirection } from '@metad/ocap-core'
import { FieldType, FieldTypeConfig } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'pac-formly-sort',
  template: `<ngm-select class="p-1" label="{{ 'FORMLY.Sort.Label' | translate: { Default: 'Sort Field' } }}" displayDensity="compact"
    searchable
    valueKey="key"
    [selectOptions]="props.options | async"
    [(ngModel)]="by"
  >
    <div ngmSuffix>
      <button z-button zType="ghost" zSize="icon" zShape="circle" displayDensity="compact" (click)="$event.stopPropagation(); toggleOrder()">
        <z-icon *ngIf="order === OrderDirection.DESC" zType="arrow_upward"></z-icon>
        <z-icon *ngIf="order === OrderDirection.ASC || !order" zType="arrow_downward"></z-icon>
      </button>
    </div>

    <ng-template ngmOptionContent let-value="value" let-highlight="highlight">
      <ngm-entity-property class="flex-1" [property]="value" [highlight]="highlight"></ngm-entity-property>
    </ng-template>
  </ngm-select>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./sort.type.scss'],
  imports: [CommonModule, FormsModule, TranslateModule, ZardIconComponent, ZardButtonComponent, NgmSelectModule, OcapCoreModule, NgmEntityPropertyComponent]
})
export class FormlyFieldSortComponent extends FieldType<FieldTypeConfig<any>> {
  OrderDirection = OrderDirection

  get model() {
    return this.formControl?.value
  }

  set model(value) {
    this.formControl?.setValue(value)
  }

  get by() {
    return this.model?.by
  }
  set by(value) {
    this.model = { ...(this.model ?? {}), by: value }
  }

  get order(): string {
    return this.model?.order
  }
  set order(value) {
    this.model = { ...(this.model ?? {}), order: value }
  }

  toggleOrder() {
    this.order = this.order?.toUpperCase() === OrderDirection.DESC ? OrderDirection.ASC : OrderDirection.DESC
  }
}
