import { NgmDSCoreService, NgmOcapCoreService, NgmSmartFilterBarService } from '@xpert-ai/ocap-angular/core'
import { NxStoryService } from '@xpert-ai/story/core'
import { NxSettingsPanelService } from '@xpert-ai/story/designer'

export function provideStory() {
  return [NgmDSCoreService, NgmOcapCoreService, NxStoryService]
}

export function provideStoryDesigner() {
  return [NgmDSCoreService, NxStoryService, NgmOcapCoreService, NxSettingsPanelService]
}

export function provideStoryPoint() {
  return [NgmDSCoreService, NxStoryService, NgmSmartFilterBarService]
}