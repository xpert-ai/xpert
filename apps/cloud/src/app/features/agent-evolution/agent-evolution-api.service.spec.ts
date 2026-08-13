import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import type { EvolutionTargetDescriptor } from '@xpert-ai/contracts'
import { AgentEvolutionApiService } from './agent-evolution-api.service'
import { EMPTY_EVOLUTION_DASHBOARD, type EvolutionSimulationResult } from './agent-evolution.types'

describe('AgentEvolutionApiService', () => {
  let service: AgentEvolutionApiService
  let httpMock: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] })
    service = TestBed.inject(AgentEvolutionApiService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => httpMock.verify())

  it('loads the native Cloud dashboard from the shared Agent Evolution API', () => {
    let response = null
    service.getDashboard().subscribe((value) => (response = value))

    const request = httpMock.expectOne('/api/agent-evolution/dashboard')
    expect(request.request.method).toBe('GET')
    request.flush(EMPTY_EVOLUTION_DASHBOARD)
    expect(response).toEqual(EMPTY_EVOLUTION_DASHBOARD)
  })

  it('synchronizes registered targets', () => {
    let response: EvolutionTargetDescriptor[] | undefined
    service.synchronizeTargets().subscribe((value) => (response = value))

    const request = httpMock.expectOne('/api/agent-evolution/targets/synchronize')
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toEqual({})
    request.flush([])
    expect(response).toEqual([])
  })

  it('executes the complete conformance simulation', () => {
    const result: EvolutionSimulationResult = {
      example: {
        key: 'localized-invoice-field-mapping',
        name: 'Localized invoice amount field mapping',
        description: 'Complete persisted example',
        dataClassification: 'synthetic_test_fixture'
      },
      simulationId: 'sim-1',
      targetId: 'field-mapping',
      eventIds: ['event-1'],
      proposalId: 'proposal-1',
      candidateId: 'candidate-1',
      datasetSnapshotId: 'dataset-1',
      evaluationRunId: 'evaluation-1',
      approvalId: 'approval-1',
      releasePackageId: 'release-1',
      deploymentIds: ['shadow-1', 'canary-1'],
      bundleIds: ['baseline-bundle', 'candidate-bundle'],
      versionIds: ['v1', 'v2'],
      pointerId: 'pointer-1',
      previousVersionId: 'v1',
      activeVersionId: 'v2',
      pointerRevision: 2,
      gatePassed: true,
      auditIds: ['audit-1'],
      auditActions: ['active_pointer.cas_activated'],
      persistence: {
        verified: true,
        rowCount: 1,
        tables: [
          {
            table: 'agent_evolution_active_pointer',
            expectedCount: 1,
            actualCount: 1,
            recordIds: ['pointer-1'],
            missingRecordIds: []
          }
        ]
      }
    }
    let response: EvolutionSimulationResult | undefined
    service.simulateConformance().subscribe((value) => (response = value))

    const request = httpMock.expectOne('/api/agent-evolution/examples/conformance-field-mapping/run')
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toEqual({})
    request.flush(result)
    expect(response).toEqual(result)
  })
})
