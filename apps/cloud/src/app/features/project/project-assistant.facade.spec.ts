import { TestBed } from '@angular/core/testing'
import { ProjectCoreStatusEnum, createProjectId, createXpertId } from '@xpert-ai/contracts'
import { of } from 'rxjs'
import { AssistantBindingService } from '../../@core/services/assistant-binding.service'
import { ChatConversationService } from '../../@core/services/chat-conversation.service'
import { injectHostedAssistantChatkitControl } from '../assistant/assistant-chatkit.runtime'
import { ProjectAssistantFacade } from './project-assistant.facade'

jest.mock('../assistant/assistant-chatkit.runtime', () => {
  const { signal } = jest.requireActual('@angular/core')

  return {
    injectHostedAssistantChatkitControl: jest.fn(() => signal(null)),
    sanitizeAssistantFrameUrl: jest.fn((value: string | null | undefined) => value)
  }
})

describe('ProjectAssistantFacade', () => {
  const injectHostedAssistantChatkitControlMock = jest.mocked(injectHostedAssistantChatkitControl)

  function createFacade() {
    TestBed.resetTestingModule()
    const chatConversationService = {
      findLatestByProject: jest.fn().mockReturnValue(of(null))
    }

    TestBed.configureTestingModule({
      providers: [
        ProjectAssistantFacade,
        {
          provide: AssistantBindingService,
          useValue: {
            getAvailableXperts: jest.fn().mockReturnValue(of([]))
          }
        },
        {
          provide: ChatConversationService,
          useValue: chatConversationService
        }
      ]
    })

    return {
      facade: TestBed.inject(ProjectAssistantFacade),
      chatConversationService
    }
  }

  async function flushTasks() {
    await Promise.resolve()
    await Promise.resolve()
  }

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('loads the latest conversation for the selected project assistant', async () => {
    const { facade, chatConversationService } = createFacade()

    facade.setProject({
      id: createProjectId('project-1'),
      name: 'Project',
      goal: 'Ship without context project scope',
      mainAssistantId: createXpertId('assistant-1'),
      status: ProjectCoreStatusEnum.Active
    })

    await flushTasks()

    expect(chatConversationService.findLatestByProject).toHaveBeenCalledWith('project-1', 'assistant-1')
  })

  it('requests a single page refresh from matching mutating project tool logs', async () => {
    const { facade } = createFacade()
    const refreshRequested = jest.fn()
    const options = injectHostedAssistantChatkitControlMock.mock.calls.at(-1)?.[0]

    facade.setProjectDataRefreshRequested(refreshRequested)

    options?.onLog?.({
      name: 'lg.tool.end',
      data: {
        toolName: 'createProjectTasks'
      }
    })
    options?.onLog?.({
      name: 'lg.tool.end',
      data: {
        toolName: 'updateProjectTasks'
      }
    })

    expect(refreshRequested).not.toHaveBeenCalled()

    await flushTasks()

    expect(refreshRequested).toHaveBeenCalledTimes(1)
  })

  it('requests a page refresh for sprint update tool logs', async () => {
    const { facade } = createFacade()
    const refreshRequested = jest.fn()
    const options = injectHostedAssistantChatkitControlMock.mock.calls.at(-1)?.[0]

    facade.setProjectDataRefreshRequested(refreshRequested)

    options?.onLog?.({
      name: 'lg.tool.end',
      data: {
        toolName: 'updateProjectSprint'
      }
    })

    await flushTasks()

    expect(refreshRequested).toHaveBeenCalledTimes(1)
  })

  it('ignores non-mutating project assistant tool logs', async () => {
    const { facade } = createFacade()
    const refreshRequested = jest.fn()
    const options = injectHostedAssistantChatkitControlMock.mock.calls.at(-1)?.[0]

    facade.setProjectDataRefreshRequested(refreshRequested)

    options?.onLog?.({
      name: 'lg.tool.end',
      data: {
        toolName: 'listProjectTasks'
      }
    })
    await flushTasks()

    expect(refreshRequested).not.toHaveBeenCalled()
  })
})
