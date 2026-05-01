import { TestBed } from '@angular/core/testing'
import {
  type IProjectTask,
  ProjectCoreStatusEnum,
  ProjectTaskExecutionStatusEnum,
  ProjectTaskStatusEnum,
  createProjectId,
  createSprintId,
  createTeamId,
  createXpertId
} from '@xpert-ai/contracts'
import { of, throwError } from 'rxjs'
import { ChatConversationService } from '../../@core/services/chat-conversation.service'
import { injectHostedAssistantChatkitControl } from '../assistant/assistant-chatkit.runtime'
import { ProjectAssistantFacade } from './project-assistant.facade'
import { ProjectTaskAssistantFacade } from './project-task-assistant.facade'

jest.mock('../assistant/assistant-chatkit.runtime', () => {
  const { signal } = jest.requireActual('@angular/core')

  return {
    injectHostedAssistantChatkitControl: jest.fn(() => signal(null)),
    sanitizeAssistantFrameUrl: jest.fn((value: string | null | undefined) => value)
  }
})

describe('ProjectTaskAssistantFacade', () => {
  const injectHostedAssistantChatkitControlMock = jest.mocked(injectHostedAssistantChatkitControl)

  function createFacade() {
    TestBed.resetTestingModule()
    const chatConversationService = {
      getOneById: jest.fn().mockReturnValue(
        of({
          id: 'conversation-1',
          threadId: 'thread-1',
          title: 'Task chat',
          xpertId: createXpertId('fallback-xpert')
        })
      )
    }
    const projectAssistantFacade = {
      logChatkitEffect: jest.fn(),
      trackProjectMutationLog: jest.fn()
    }

    TestBed.configureTestingModule({
      providers: [
        ProjectTaskAssistantFacade,
        {
          provide: ProjectAssistantFacade,
          useValue: projectAssistantFacade
        },
        {
          provide: ChatConversationService,
          useValue: chatConversationService
        }
      ]
    })

    return {
      facade: TestBed.inject(ProjectTaskAssistantFacade),
      chatConversationService,
      projectAssistantFacade
    }
  }

  async function flushTasks() {
    await Promise.resolve()
    await Promise.resolve()
  }

  function createProject() {
    return {
      id: createProjectId('project-1'),
      name: 'Project',
      goal: 'Ship task side panel',
      mainAssistantId: createXpertId('assistant-1'),
      status: ProjectCoreStatusEnum.Active
    }
  }

  function createTask(options?: { conversationId?: string | null; xpertId?: ReturnType<typeof createXpertId> }) {
    const projectId = createProjectId('project-1')
    const sprintId = createSprintId('sprint-1')

    return {
      id: 'task-1',
      projectId,
      sprintId,
      swimlaneId: 'lane-1',
      title: 'Build task panel',
      sortOrder: 0,
      status: ProjectTaskStatusEnum.Done,
      dependencies: [],
      latestExecution: {
        id: 'execution-1',
        projectId,
        sprintId,
        taskId: 'task-1',
        teamId: createTeamId('team-1'),
        xpertId: options?.xpertId ?? createXpertId('xpert-1'),
        dispatchId: 'dispatch-1',
        status: ProjectTaskExecutionStatusEnum.Success,
        conversationId: options?.conversationId ?? 'conversation-1',
        organizationId: 'org-1'
      }
    } satisfies IProjectTask
  }

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('loads a task conversation and opens its execution assistant thread', async () => {
    const { facade, chatConversationService } = createFacade()
    const taskControlOptions = injectHostedAssistantChatkitControlMock.mock.calls[0]?.[0]

    facade.setProject(createProject())
    facade.setTaskConversation(createTask())

    await flushTasks()

    expect(chatConversationService.getOneById).toHaveBeenCalledWith('conversation-1', undefined, 'org-1')
    expect(facade.viewState()).toBe('ready')
    expect(taskControlOptions?.assistantId()).toBe('xpert-1')
    expect(taskControlOptions?.initialThread?.()).toBe('thread-1')
    expect(taskControlOptions?.projectId?.()).toBe('project-1')
    expect(taskControlOptions?.identity()).toBe('project-1:task-1:conversation-1:thread-1:xpert-1')
  })

  it('falls back to the conversation assistant when the execution assistant is blank', async () => {
    const { facade } = createFacade()
    const taskControlOptions = injectHostedAssistantChatkitControlMock.mock.calls[0]?.[0]

    facade.setProject(createProject())
    facade.setTaskConversation(createTask({ xpertId: createXpertId('') }))

    await flushTasks()

    expect(taskControlOptions?.assistantId()).toBe('fallback-xpert')
    expect(taskControlOptions?.identity()).toBe('project-1:task-1:conversation-1:thread-1:fallback-xpert')
  })

  it('sets an error state when the conversation cannot load', async () => {
    const { facade, chatConversationService } = createFacade()
    chatConversationService.getOneById.mockReturnValueOnce(throwError(() => new Error('Conversation missing')))

    facade.setTaskConversation(createTask())

    await flushTasks()

    expect(facade.viewState()).toBe('error')
    expect(facade.error()).toBe('Conversation missing')
  })

  it('clears task conversation state when the task conversation closes', async () => {
    const { facade } = createFacade()
    const taskControlOptions = injectHostedAssistantChatkitControlMock.mock.calls[0]?.[0]

    facade.setProject(createProject())
    facade.setTaskConversation(createTask())
    await flushTasks()

    facade.setTaskConversation(null)
    await flushTasks()

    expect(facade.viewState()).toBe('idle')
    expect(taskControlOptions?.assistantId()).toBeNull()
    expect(taskControlOptions?.identity()).toBeNull()
  })

  it('clears the selected task when the project changes', async () => {
    const { facade } = createFacade()

    facade.setProject(createProject())
    facade.setTaskConversation(createTask())
    await flushTasks()

    facade.setProject({
      ...createProject(),
      id: createProjectId('project-2')
    })

    expect(facade.taskConversation()).toBeNull()
    expect(facade.viewState()).toBe('idle')
  })

  it('delegates ChatKit events to the project assistant refresh handlers', () => {
    const { projectAssistantFacade } = createFacade()
    const taskControlOptions = injectHostedAssistantChatkitControlMock.mock.calls[0]?.[0]
    const logEvent = {
      name: 'lg.tool.end',
      data: {
        toolName: 'createProjectTasks'
      }
    }
    const effectEvent = {
      name: 'effect',
      data: {
        ok: true
      }
    }

    taskControlOptions?.onLog?.(logEvent)
    taskControlOptions?.onEffect?.(effectEvent)

    expect(projectAssistantFacade.trackProjectMutationLog).toHaveBeenCalledWith(logEvent)
    expect(projectAssistantFacade.logChatkitEffect).toHaveBeenCalledWith(effectEvent)
  })
})
