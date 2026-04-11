import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, HostBinding } from '@angular/core'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { EntityCapacity, NgmEntitySchemaComponent } from '@xpert-ai/ocap-angular/entity'
import { FieldType, FormlyModule } from '@ngx-formly/core'

@Component({
  standalone: true,
  selector: 'pac-formly-entity-type',
  templateUrl: `entity-type.component.html`,
  styleUrls: [`entity-type.component.scss`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormlyModule, DragDropModule, OcapCoreModule, NgmEntitySchemaComponent]
})
export class PACFormlyEntityTypeComponent extends FieldType {
  @HostBinding('class.pac-formly-entity-type') _isPACFormlyEntityTypeComponent = true
  EntityCapacity = EntityCapacity
  
  get valueFormControl() {
    return this.formControl as FormControl
  }
}
