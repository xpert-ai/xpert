import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ARTIFACT_PRESENTATION_OPEN_COMMAND } from '@xpert-ai/contracts'
import {
  ViewClientCommandRegistry,
  ViewClientCommandContext
} from '../../@shared/view-extension/view-client-command-registry.service'
import { registerArtifactPresentationOpenCommand } from './presentation-open-command'
import { provideArtifactPresentationCommands } from './presentation.providers'

describe('Artifact presentation opening', () => {
  const context = {
    manifest: { clientCommands: [{ key: ARTIFACT_PRESENTATION_OPEN_COMMAND }] }
  } as ViewClientCommandContext
  const url = `${window.location.origin}/artifacts/view/example-link`
  let registry: ViewClientCommandRegistry
  beforeEach(() => {
    registry = new ViewClientCommandRegistry()
    registerArtifactPresentationOpenCommand(registry)
  })
  afterEach(() => jest.restoreAllMocks())

  it('opens an authenticated viewer in a new host window with no opener', async () => {
    const popup = { opener: window, location: { replace: jest.fn() } }
    const open = jest.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    expect(await registry.execute(ARTIFACT_PRESENTATION_OPEN_COMMAND, { url }, context)).toEqual({ success: true })
    expect(open).toHaveBeenCalledWith('about:blank', '_blank')
    expect(popup.opener).toBeNull()
    expect(popup.location.replace).toHaveBeenCalledWith(url)
  })

  it.each([
    'https://example.com/artifacts/view/link',
    'javascript:alert(1)',
    `${url}?redirect=//example.com`,
    `${url}#script`,
    `${url}/extra`,
    `${window.location.origin}/settings`
  ])('rejects unrelated URLs: %s', async (value) => {
    const open = jest.spyOn(window, 'open')
    expect(await registry.execute(ARTIFACT_PRESENTATION_OPEN_COMMAND, { url: value }, context)).toEqual({
      success: false,
      code: 'bad_request'
    })
    expect(open).not.toHaveBeenCalled()
  })

  it('rejects undeclared commands and reports blocked popups', async () => {
    const open = jest.spyOn(window, 'open').mockReturnValue(null)
    expect(
      await registry.execute(ARTIFACT_PRESENTATION_OPEN_COMMAND, { url }, { manifest: {} } as ViewClientCommandContext)
    ).toEqual({ success: false, code: 'forbidden' })
    expect(open).not.toHaveBeenCalled()
    expect(await registry.execute(ARTIFACT_PRESENTATION_OPEN_COMMAND, { url }, context)).toEqual({
      success: false,
      code: 'popup_blocked'
    })
  })

  it('registers only when the feature provider is installed and unregisters when its injector is destroyed', async () => {
    const commands = new ViewClientCommandRegistry()
    jest.spyOn(window, 'open').mockReturnValue(null)
    expect(await commands.execute(ARTIFACT_PRESENTATION_OPEN_COMMAND, { url }, context)).toMatchObject({
      success: false,
      code: 'unsupported'
    })
    const injector = createEnvironmentInjector(
      [{ provide: ViewClientCommandRegistry, useValue: commands }, provideArtifactPresentationCommands()],
      TestBed.inject(EnvironmentInjector)
    )
    try {
      expect(await commands.execute(ARTIFACT_PRESENTATION_OPEN_COMMAND, { url }, context)).toEqual({
        success: false,
        code: 'popup_blocked'
      })
    } finally {
      injector.destroy()
    }
    expect(await commands.execute(ARTIFACT_PRESENTATION_OPEN_COMMAND, { url }, context)).toMatchObject({
      success: false,
      code: 'unsupported'
    })
  })
})
