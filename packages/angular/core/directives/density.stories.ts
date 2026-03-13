import { provideHttpClient } from '@angular/common/http'

import { MatChipsModule } from '@angular/material/chips'
import { provideAnimations } from '@angular/platform-browser/animations'
import { NgmSearchComponent } from '@metad/ocap-angular/common'
import { provideTranslate } from '@metad/ocap-angular/mock'
import { StoryObj, applicationConfig, moduleMetadata } from '@storybook/angular'
import { OcapCoreModule } from '../core.module'
import { DensityDirective } from './displayDensity'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardCheckboxComponent, ZardIconComponent, ZardMenuImports } from '@xpert-ai/headless-ui'

export default {
  title: 'Core/DisplayDensity',
  component: NgmSearchComponent,
  decorators: [
    applicationConfig({
      providers: [provideAnimations(), provideHttpClient(), provideTranslate()]
    }),
    moduleMetadata({
      imports: [
        TranslateModule,
        OcapCoreModule,
        ZardIconComponent,
        ZardButtonComponent,
        MatChipsModule,
        ZardCheckboxComponent,
        ...ZardMenuImports,
        DensityDirective,
        NgmSearchComponent
      ],
      providers: []
    })
  ]
}

type Story = StoryObj<NgmSearchComponent>

export const Primary: Story = {
  args: {},
  render: (args) => ({
    props: args,
    template: `
    <div>
      <z-icon zType="share"></z-icon>
      <z-icon zSize="default" zType="share"></z-icon>
      <z-icon zSize="sm" zType="share"></z-icon>
    </div>
    
    <div>
      <button z-button zType="ghost" zSize="icon" zShape="circle">
        <z-icon zType="share"></z-icon>
      </button>
      <button z-button zType="ghost" zSize="icon" zShape="circle" displayDensity="cosy">
        <z-icon zType="share"></z-icon>
      </button>
      <button z-button zType="ghost" zSize="icon" zShape="circle" displayDensity="compact">
        <z-icon zType="share"></z-icon>
      </button>
    </div>
    
    <div displayDensity="comfort">
      <z-checkbox>Check me!</z-checkbox>
      <ngm-search></ngm-search>
      <mat-chip-grid #chipGrid aria-label="Fruit selection">
        <mat-chip-row>fruit
          <button matChipRemove [attr.aria-label]="'remove ' + fruit">
            <z-icon zType="cancel"></z-icon>
          </button>
        </mat-chip-row>
      </mat-chip-grid>
    </div>
    <div displayDensity="cosy">
      <z-checkbox displayDensity="cosy">Check me!</z-checkbox>
      <ngm-search></ngm-search>
      <mat-chip-grid #chipGrid aria-label="Fruit selection">
        <mat-chip-row>fruit
          <button matChipRemove [attr.aria-label]="'remove ' + fruit">
            <z-icon zType="cancel"></z-icon>
          </button>
        </mat-chip-row>
      </mat-chip-grid>
    </div>
    <div displayDensity="compact">
      <z-checkbox displayDensity="compact">Check me!</z-checkbox>
      <ngm-search></ngm-search>
      <mat-chip-grid #chipGrid aria-label="Fruit selection">
        <mat-chip-row>fruit
          <button matChipRemove [attr.aria-label]="'remove ' + fruit">
            <z-icon zType="cancel"></z-icon>
          </button>
        </mat-chip-row>
      </mat-chip-grid>
    </div>
    
    <div class="flex items-center gap-2">
      <mat-chip-grid displayDensity="comfort">
        <mat-chip-row>fruit
          <button matChipRemove [attr.aria-label]="'remove ' + fruit">
            <z-icon zType="cancel"></z-icon>
          </button>
        </mat-chip-row>
      </mat-chip-grid>
      <mat-chip-grid displayDensity="cosy">
        <mat-chip-row>fruit
          <button matChipRemove [attr.aria-label]="'remove ' + fruit">
            <z-icon zType="cancel"></z-icon>
          </button>
        </mat-chip-row>
      </mat-chip-grid>
      <mat-chip-grid displayDensity="compact">
        <mat-chip-row>fruit
          <button matChipRemove [attr.aria-label]="'remove ' + fruit">
            <z-icon zType="cancel"></z-icon>
          </button>
        </mat-chip-row>
      </mat-chip-grid>
    </div>
    
    <div class="flex items-center gap-2">
      <mat-chip-set><mat-chip>fruit</mat-chip></mat-chip-set>
      <mat-chip-set displayDensity="cosy"><mat-chip>fruit</mat-chip></mat-chip-set>
      <mat-chip-set displayDensity="compact"><mat-chip>fruit</mat-chip></mat-chip-set>
    </div>
    `
  })
}

export const Menu: Story = {
  args: {},
  render: (args) => ({
    props: args,
    template: `
<div class="flex flex-col">
  <label>Comfortable</label>
  <button z-button zType="ghost" zSize="icon" zShape="circle" displayDensity="comfortable" class="pac-model__nav-action" z-menu [zMenuTriggerFor]="menu1" #mt="zMenuTrigger" [class.active]="mt.menuOpen" (click)="$event.stopPropagation();$event.preventDefault()">
    <z-icon zType="more_vert"></z-icon>
  </button>

  <ng-template #menu1>
    <div z-menu-content class="ngm-density__comfortable">
    <button type="button" z-menu-item>
        <z-icon zType="stars"></z-icon>
        <span>{{ 'PAC.MODEL.SaveAsDefaultCube' | translate: {Default: "Save as Default Cube"} }}</span>
    </button>
    <button type="button" z-menu-item class="ngm-appearance-danger">
        <z-icon zType="delete_forever"></z-icon>
        <span>{{ 'PAC.ACTIONS.Delete' | translate: {Default: "Delete"} }}</span>
    </button>
    </div>
  </ng-template>

  <label>Cosy</label>
  <button z-button zType="ghost" zSize="icon" zShape="circle" displayDensity="cosy" class="pac-model__nav-action" z-menu [zMenuTriggerFor]="menu2" #mt="zMenuTrigger" [class.active]="mt.menuOpen" (click)="$event.stopPropagation();$event.preventDefault()">
    <z-icon zType="more_vert"></z-icon>
  </button>

  <ng-template #menu2>
    <div z-menu-content class="ngm-density__cosy">
    <button type="button" z-menu-item>
        <z-icon zType="stars"></z-icon>
        <span>{{ 'PAC.MODEL.SaveAsDefaultCube' | translate: {Default: "Save as Default Cube"} }}</span>
    </button>
    <button type="button" z-menu-item class="ngm-appearance-danger">
        <z-icon zType="delete_forever"></z-icon>
        <span>{{ 'PAC.ACTIONS.Delete' | translate: {Default: "Delete"} }}</span>
    </button>
    </div>
  </ng-template>

  <label>Compact</label>

  <button z-button zType="ghost" zSize="icon" zShape="circle" displayDensity="compact" class="pac-model__nav-action" z-menu [zMenuTriggerFor]="menu3" #mt="zMenuTrigger" [class.active]="mt.menuOpen" (click)="$event.stopPropagation();$event.preventDefault()">
    <z-icon zType="more_vert"></z-icon>
  </button>

  <ng-template #menu3>
    <div z-menu-content class="ngm-density__compact">
    <button type="button" z-menu-item>
        <z-icon zType="stars"></z-icon>
        <span>{{ 'PAC.MODEL.SaveAsDefaultCube' | translate: {Default: "Save as Default Cube"} }}</span>
    </button>
    <button type="button" z-menu-item class="ngm-appearance-danger">
        <z-icon zType="delete_forever"></z-icon>
        <span>{{ 'PAC.ACTIONS.Delete' | translate: {Default: "Delete"} }}</span>
    </button>
    </div>
  </ng-template>
</div>
    `
  })
}
