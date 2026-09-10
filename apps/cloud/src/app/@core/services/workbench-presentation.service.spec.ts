import { WorkbenchPresentationService } from './workbench-presentation.service'

describe('WorkbenchPresentationService', () => {
  it('keeps a new routed workbench immersive while an older workbench is destroyed', () => {
    const presentation = new WorkbenchPresentationService()
    expect(presentation.immersive()).toBe(false)
    const leavePrevious = presentation.enter()
    const leaveNext = presentation.enter()
    leavePrevious()
    expect(presentation.immersive()).toBe(true)
    leavePrevious()
    expect(presentation.immersive()).toBe(true)
    leaveNext()
    expect(presentation.immersive()).toBe(false)
  })
})
