import { CommonModule } from '@angular/common'
import { HttpClientModule } from '@angular/common/http'
import { AfterViewInit, Component, NgModule, OnInit } from '@angular/core'
import { NgmFormlyModule } from '@xpert-ai/formly'

import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { FormlyModule } from '@ngx-formly/core'
import { uuid } from '@xpert-ai/ds-core'
import { Meta, moduleMetadata, Story } from '@storybook/angular'
import { LoggerModule, NgxLoggerLevel } from 'ngx-logger'
import { BehaviorSubject, Observable, of } from 'rxjs'
import { NxComponentSettingsComponent } from './component-form/component-form.component'
import { NxDesignerModule } from './designer.module'
import { NgmSettingsPanelComponent } from './settings-panel/settings-panel.component'
import { NxSettingsPanelService } from './settings-panel/settings-panel.service'
import { DesignerSchema, STORY_DESIGNER_COMPONENT } from './types'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

class SchemaService implements DesignerSchema {
  model: any

  getSchema(): Observable<any> {
    return of([
      {
        key: 'settings',
        type: 'input',
        templateOptions: {
          label: 'Settings',
        },
      },
    ])
  }
}

@Component({
  selector: 'ngm-designer-wrapper',
  template: `<ngm-settings-panel fxFlex="100"></ngm-settings-panel>
<div>
<button z-button zType="default" (click)="openBasic()">Basic</button>
<button z-button zType="default" (click)="openTabs()">Tabs</button>
<button z-button zType="default" (click)="changeModel()">Change Model</button>
</div>
  `,
  styles: [`
:host {
  height: 400px;
  width: 300px;
  flex-direction: column;
}
`],
  providers: [ NxSettingsPanelService ]
})
class NxDesignerWrapperComponent implements OnInit, AfterViewInit {

  model = new BehaviorSubject({settings: 'ABC'})
  constructor(private settingsPanelService: NxSettingsPanelService) {}

  ngAfterViewInit(): void {
    this.settingsPanelService.setEditable(true)
  }

  ngOnInit(): void {
    //
  }

  openBasic() {
    this.settingsPanelService.openDesigner('StoryPoint', {}, uuid())
    .subscribe(result => {
      console.log(result)
    })
  }

  openTabs() {

    this.settingsPanelService.openTabsDesigner(uuid(), [
      {
        label: 'Builder',
        componentType: 'StoryPoint',
        model: {
        },
      },
      {
        label: 'Styling',
        componentType: 'StoryPoint',
        model: this.model
      }
    ])
      .subscribe((result) => {
        console.log(result)
      })
  }

  changeModel() {
    this.model.value.settings = '123'
    this.model.next(this.model.value)
  }
}

@NgModule({
  declarations: [NxDesignerWrapperComponent],
  imports: [CommonModule, NxDesignerModule, ZardButtonComponent],
  exports: [NxDesignerWrapperComponent],
})
class NxDesignerWrapperModule {
  //
}

export default {
  title: 'Story/Designer',
  component: NgmSettingsPanelComponent,
  argTypes: {},
  decorators: [
    moduleMetadata({
      declarations: [],
      imports: [
        BrowserAnimationsModule,
        HttpClientModule,
        LoggerModule.forRoot({
          level: NgxLoggerLevel.DEBUG
        }),
        NxDesignerWrapperModule,
        FormlyModule.forRoot(),
        NgmFormlyModule,
      ],
      providers: [
        {
          provide: STORY_DESIGNER_COMPONENT,
          useValue: {
            type: 'StoryPoint',
            component: NxComponentSettingsComponent,
            schema: SchemaService,
          },
          multi: true,
        },
      ],
    }),
  ],
} as Meta

const Template: Story<NgmSettingsPanelComponent> = (args) => ({
  template: `<ngm-designer-wrapper></ngm-designer-wrapper>`,
  props: {
    ...args,
  },
})

export const Primary = Template.bind({})
Primary.args = {}
