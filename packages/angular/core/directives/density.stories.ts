import { provideHttpClient } from '@angular/common/http'

import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatChipsModule } from '@angular/material/chips'
import { MatIconModule } from '@angular/material/icon'
import { MatMenuModule } from '@angular/material/menu'
import { provideAnimations } from '@angular/platform-browser/animations'
import { NgmSearchComponent } from '@metad/ocap-angular/common'
import { provideTranslate } from '@metad/ocap-angular/mock'
import { StoryObj, applicationConfig, moduleMetadata } from '@storybook/angular'
import { OcapCoreModule } from '../core.module'
import { DensityDirective } from './displayDensity'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

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
        MatIconModule,
        ZardButtonComponent,
        MatChipsModule,
        MatCheckboxModule,
        MatMenuModule,
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
      <mat-icon>share</mat-icon>
      <mat-icon displayDensity="cosy">share</mat-icon>
      <mat-icon displayDensity="compact">share</mat-icon>
    </div>
    
    <div>
      <button z-button zType="ghost" zSize="icon" zShape="circle">
        <mat-icon>share</mat-icon>
      </button>
      <button z-button zType="ghost" zSize="icon" zShape="circle" displayDensity="cosy">
        <mat-icon>share</mat-icon>
      </button>
      <button z-button zType="ghost" zSize="icon" zShape="circle" displayDensity="compact">
        <mat-icon>share</mat-icon>
      </button>
    </div>
    
    <div displayDensity="comfort">
      <mat-checkbox>Check me!</mat-checkbox>
      <ngm-search></ngm-search>
      <mat-chip-grid #chipGrid aria-label="Fruit selection">
        <mat-chip-row>fruit
          <button matChipRemove [attr.aria-label]="'remove ' + fruit">
            <mat-icon>cancel</mat-icon>
          </button>
        </mat-chip-row>
      </mat-chip-grid>
    </div>
    <div displayDensity="cosy">
      <mat-checkbox>Check me!</mat-checkbox>
      <ngm-search></ngm-search>
      <mat-chip-grid #chipGrid aria-label="Fruit selection">
        <mat-chip-row>fruit
          <button matChipRemove [attr.aria-label]="'remove ' + fruit">
            <mat-icon>cancel</mat-icon>
          </button>
        </mat-chip-row>
      </mat-chip-grid>
    </div>
    <div displayDensity="compact">
      <mat-checkbox>Check me!</mat-checkbox>
      <ngm-search></ngm-search>
      <mat-chip-grid #chipGrid aria-label="Fruit selection">
        <mat-chip-row>fruit
          <button matChipRemove [attr.aria-label]="'remove ' + fruit">
            <mat-icon>cancel</mat-icon>
          </button>
        </mat-chip-row>
      </mat-chip-grid>
    </div>
    
    <div class="flex items-center gap-2">
      <mat-chip-grid displayDensity="comfort">
        <mat-chip-row>fruit
          <button matChipRemove [attr.aria-label]="'remove ' + fruit">
            <mat-icon>cancel</mat-icon>
          </button>
        </mat-chip-row>
      </mat-chip-grid>
      <mat-chip-grid displayDensity="cosy">
        <mat-chip-row>fruit
          <button matChipRemove [attr.aria-label]="'remove ' + fruit">
            <mat-icon>cancel</mat-icon>
          </button>
        </mat-chip-row>
      </mat-chip-grid>
      <mat-chip-grid displayDensity="compact">
        <mat-chip-row>fruit
          <button matChipRemove [attr.aria-label]="'remove ' + fruit">
            <mat-icon>cancel</mat-icon>
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
  <button z-button zType="ghost" zSize="icon" zShape="circle" displayDensity="comfortable" class="pac-model__nav-action" [matMenuTriggerFor]="menu1" #mt="matMenuTrigger" [class.active]="mt.menuOpen" (click)="$event.stopPropagation();$event.preventDefault()">
    <mat-icon>more_vert</mat-icon>
  </button>

  <mat-menu #menu1="matMenu" class="ngm-density__comfortable">
    <button mat-menu-item>
        <mat-icon fontSet="material-icons-outlined">stars</mat-icon>
        <span>{{ 'PAC.MODEL.SaveAsDefaultCube' | translate: {Default: "Save as Default Cube"} }}</span>
    </button>
    <button mat-menu-item class="ngm-appearance-danger">
        <mat-icon fontSet="material-icons-round">delete_forever</mat-icon>
        <span>{{ 'PAC.ACTIONS.Delete' | translate: {Default: "Delete"} }}</span>
    </button>
  </mat-menu>

  <label>Cosy</label>
  <button z-button zType="ghost" zSize="icon" zShape="circle" displayDensity="cosy" class="pac-model__nav-action" [matMenuTriggerFor]="menu2" #mt="matMenuTrigger" [class.active]="mt.menuOpen" (click)="$event.stopPropagation();$event.preventDefault()">
    <mat-icon>more_vert</mat-icon>
  </button>

  <mat-menu #menu2="matMenu" class="ngm-density__cosy">
    <button mat-menu-item>
        <mat-icon fontSet="material-icons-outlined">stars</mat-icon>
        <span>{{ 'PAC.MODEL.SaveAsDefaultCube' | translate: {Default: "Save as Default Cube"} }}</span>
    </button>
    <button mat-menu-item class="ngm-appearance-danger">
        <mat-icon fontSet="material-icons-round">delete_forever</mat-icon>
        <span>{{ 'PAC.ACTIONS.Delete' | translate: {Default: "Delete"} }}</span>
    </button>
  </mat-menu>

  <label>Compact</label>

  <button z-button zType="ghost" zSize="icon" zShape="circle" displayDensity="compact" class="pac-model__nav-action" [matMenuTriggerFor]="menu3" #mt="matMenuTrigger" [class.active]="mt.menuOpen" (click)="$event.stopPropagation();$event.preventDefault()">
    <mat-icon>more_vert</mat-icon>
  </button>

  <mat-menu #menu3="matMenu" class="ngm-density__compact">
    <button mat-menu-item>
        <mat-icon fontSet="material-icons-outlined">stars</mat-icon>
        <span>{{ 'PAC.MODEL.SaveAsDefaultCube' | translate: {Default: "Save as Default Cube"} }}</span>
    </button>
    <button mat-menu-item class="ngm-appearance-danger">
        <mat-icon fontSet="material-icons-round">delete_forever</mat-icon>
        <span>{{ 'PAC.ACTIONS.Delete' | translate: {Default: "Delete"} }}</span>
    </button>
  </mat-menu>
</div>
    `
  })
}
