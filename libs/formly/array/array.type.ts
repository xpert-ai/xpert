import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component } from '@angular/core';
import { FormArray } from '@angular/forms';
import { FieldArrayType } from '@ngx-formly/core';

/**
 * @todo 使用 cdkDragList 后数组中使用 property-select 组件弹出窗口的移动会有问题，暂时禁用 array drag 排序
 */
@Component({
  selector: 'ngm-formly-array',
  template: `
@if (to.label) {
  <div class="ngm-formly__title">
    <span [class.line-through]="deprecated"
      [matTooltip]="deprecated" matTooltipPosition="above"
    >{{ to.label }}</span>
  </div>
}
<div class="ngm-formly-cdk__drag-list flex flex-col justify-start items-stretch"
  [class.empty]="!field.fieldGroup?.length">

  @if (!field.fieldGroup?.length) {
    <button mat-button color="primary" type="button" (click)="add()">
      <div class="flex items-center">
        <mat-icon>add</mat-icon>{{ 'FORMLY.COMMON.ADD' | translate: {Default: 'Add'} }} {{to.label}}
      </div>
    </button>
  }

  @for (field of field.fieldGroup; track field.name; let i = $index;) {
    <div class="ngm-formly__array-row relative" cdkDragBoundary=".ngm-formly-cdk__drag-list" cdkDrag>
      <div class="text-sm flex justify-between items-center">
        @if (props.labelField) {
          <span>{{model[i]?.[props.labelField]}}</span>
        }
      </div>

      @if (!to.hideDelete) {
        <button class="ngm-formly__remove" mat-icon-button color="warn" displayDensity="compact"
          (click)="remove(i)">
          <mat-icon>clear</mat-icon>
        </button>
      }
      <formly-field class="flex-1" cdkDropList [field]="field"></formly-field>
      <div class="ngm-formly-cdk__drag-placeholder" *cdkDragPlaceholder></div>
    </div>
  }
</div>

@if (field.fieldGroup?.length) {
  <button mat-button color="primary" type="button" class="w-full"
    (click)="add()">
    <div class="flex items-center">
      <mat-icon>add</mat-icon>
      <span>{{ 'FORMLY.COMMON.ADD' | translate: {Default: 'Add'} }} {{to.label}}</span>
    </div>
  </button>
}
`,
  host: {
    class: 'ngm-formly-array'
  },
  styleUrls: ['array.type.scss'],
})
export class NgmFormlyArrayComponent extends FieldArrayType {

  get deprecated() {
    return this.props?.deprecated
  }

  drop(event: CdkDragDrop<string[]>) {
    if (!Array.isArray(this.field.fieldGroup) || !Array.isArray(this.field.model)) {
      throw new Error(`fieldGroup or model is not an array`)
    }
    moveItemInArray(this.field.fieldGroup, event.previousIndex, event.currentIndex)
    this.field.fieldGroup.forEach((fieldGroup, i) => fieldGroup.key = `${i}`)
    // done: 在某些情况下下面两行会造成重复操作的问题 ??
    moveItemInArray(this.field.model, event.previousIndex, event.currentIndex)
    moveItemInArray((this.field.formControl as FormArray).controls, event.previousIndex, event.currentIndex)
    this.field.formControl.setValue(this.field.model.map(value => value ?? {}))
  }
}
