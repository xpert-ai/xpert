import { TXpertGraph } from '../ai/xpert.model'
import { DeepPartial } from '../types'
import { allChannels, findStartNodes, getCurrentGraph } from './utils'

describe('findStartNodes', () => {
  it('should return the correct start nodes for a given key', () => {
    const graph: DeepPartial<TXpertGraph> = {
      connections: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
        { from: 'D', to: 'C' },
        { from: 'C', to: 'E' },
        { from: 'E', to: 'F' }
      ]
    }

    const startNodes = findStartNodes(graph, 'C')
    expect(startNodes).toEqual(expect.arrayContaining(['A', 'D']))
  })

  it('should return the node itself if it has no upstream nodes', () => {
    const graph: DeepPartial<TXpertGraph> = {
      connections: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' }
      ]
    }

    const startNodes = findStartNodes(graph, 'A')
    expect(startNodes).toEqual(['A'])
  })

  it('should return an empty array if the key is not in the graph', () => {
    const graph: DeepPartial<TXpertGraph> = {
      connections: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' }
      ]
    }

    const startNodes = findStartNodes(graph, 'Z')
    expect(startNodes).toEqual(['Z'])
  })

  it('should use start part of from key', () => {
    const graph: DeepPartial<TXpertGraph> = {
      connections: [
        {
          type: "edge",
          // key: "Knowledge_XlSM1H1rCb/Router_zBkMXfqpXk",
          from: "Knowledge_XlSM1H1rCb",
          to: "Router_zBkMXfqpXk",
        },
        {
          type: "edge",
          // key: "Router_zBkMXfqpXk/oUluRQoFdV/Agent_cPnbaxekWd",
          from: "Router_zBkMXfqpXk/oUluRQoFdV",
          to: "Agent_cPnbaxekWd",
        },
        {
          type: "edge",
          // key: "Router_zBkMXfqpXk/else/Answer_Pb7cYUvTJU",
          from: "Router_zBkMXfqpXk/else",
          to: "Answer_Pb7cYUvTJU",
        },
      ]
    }

    const startNodes = findStartNodes(graph, 'Agent_cPnbaxekWd')
    expect(startNodes).toEqual(['Knowledge_XlSM1H1rCb'])
  })

  it('only edge connections', () => {
    const graph: DeepPartial<TXpertGraph> = {
      connections: [
        {
          type: 'edge',
          key: 'Agent_UMVcdTL9w1/Iterating_jsCXACz4wh',
          from: 'Agent_UMVcdTL9w1',
          to: 'Iterating_jsCXACz4wh'
        },
        {
          type: 'agent',
          key: 'Iterating_jsCXACz4wh/Agent_albUSvIcdF',
          from: 'Iterating_jsCXACz4wh',
          to: 'Agent_albUSvIcdF'
        },
        {
          type: 'edge',
          key: 'Agent_albUSvIcdF/Http_T9uLo1NJUV',
          from: 'Agent_albUSvIcdF',
          to: 'Http_T9uLo1NJUV'
        },
        {
          type: 'edge',
          key: 'Iterating_jsCXACz4wh/Code_27ERnJwa2t',
          from: 'Iterating_jsCXACz4wh',
          to: 'Code_27ERnJwa2t'
        },
        {
          type: 'edge',
          key: 'Code_27ERnJwa2t/Agent_M2Wa9MQVpM',
          from: 'Code_27ERnJwa2t',
          to: 'Agent_M2Wa9MQVpM'
        },
        {
          type: 'edge',
          key: 'Agent_M2Wa9MQVpM/Answer_uzsdBtAqPq',
          from: 'Agent_M2Wa9MQVpM',
          to: 'Answer_uzsdBtAqPq'
        }
      ]
    }

    const startNodes = findStartNodes(graph, 'Agent_albUSvIcdF')
    expect(startNodes).toEqual(['Agent_albUSvIcdF'])
  })

  it('only edge connections', () => {
    const graph: DeepPartial<TXpertGraph> = {
      nodes: [],
      connections: [
        {
          type: 'edge',
          key: 'Agent_UMVcdTL9w1/Iterating_jsCXACz4wh',
          from: 'Agent_UMVcdTL9w1',
          to: 'Iterating_jsCXACz4wh'
        },
        {
          type: 'agent',
          key: 'Iterating_jsCXACz4wh/Agent_albUSvIcdF',
          from: 'Iterating_jsCXACz4wh',
          to: 'Agent_albUSvIcdF'
        },
        {
          type: 'edge',
          key: 'Agent_albUSvIcdF/Http_T9uLo1NJUV',
          from: 'Agent_albUSvIcdF',
          to: 'Http_T9uLo1NJUV'
        },
        {
          type: 'edge',
          key: 'Iterating_jsCXACz4wh/Code_27ERnJwa2t',
          from: 'Iterating_jsCXACz4wh',
          to: 'Code_27ERnJwa2t'
        },
        {
          type: 'edge',
          key: 'Code_27ERnJwa2t/Agent_M2Wa9MQVpM',
          from: 'Code_27ERnJwa2t',
          to: 'Agent_M2Wa9MQVpM'
        },
        {
          type: 'edge',
          key: 'Agent_M2Wa9MQVpM/Answer_uzsdBtAqPq',
          from: 'Agent_M2Wa9MQVpM',
          to: 'Answer_uzsdBtAqPq'
        }
      ]
    }

    const startNodes = getCurrentGraph(graph as TXpertGraph, 'Agent_albUSvIcdF')
    expect(startNodes).toEqual(['Agent_albUSvIcdF'])
  })
  
})

describe('allChannels', () => {
  it('should return the correct start nodes for a given key', () => {
    const graph: DeepPartial<TXpertGraph> = {
      nodes: [
        {
          type: "agent",
          key: "Agent_xv0UeM91O6",
        },
        {
          type: "agent",
          key: "Agent_DiQbU6FKZ6",
        },
        {
          type: "workflow",
          key: "Router_Q1uTcWa1rZ",
        },
        {
          type: "workflow",
          key: "Code_MlXFPNEphR",
        },
        {
          type: "workflow",
          key: "Knowledge_PJ2H5EObqJ",
        },
        {
          type: "workflow",
          key: "Router_A1Na6n49Ri",
        },
        {
          type: "workflow",
          key: "Code_1uEOTXgBNQ",
        },
        {
          type: "workflow",
          key: "Answer_za0cCTiayv",
        },
        {
          type: "workflow",
          key: "Iterating_CsvbR5teUm",
        },
        {
          type: "workflow",
          key: "Answer_SowVtmiosK",
        },
      ],
      connections: [
        {
          type: "edge",
          key: "Router_Q1uTcWa1rZ/TT9sQAeTa2/Agent_DiQbU6FKZ6",
          from: "Router_Q1uTcWa1rZ/TT9sQAeTa2",
          to: "Agent_DiQbU6FKZ6",
        },
        {
          type: "edge",
          key: "Knowledge_PJ2H5EObqJ/Router_A1Na6n49Ri",
          from: "Knowledge_PJ2H5EObqJ",
          to: "Router_A1Na6n49Ri",
        },
        {
          type: "edge",
          key: "Router_A1Na6n49Ri/2syn8OhkzH/Agent_xv0UeM91O6",
          from: "Router_A1Na6n49Ri/2syn8OhkzH",
          to: "Agent_xv0UeM91O6",
        },
        {
          type: "edge",
          key: "Router_A1Na6n49Ri/else/Code_1uEOTXgBNQ",
          from: "Router_A1Na6n49Ri/else",
          to: "Code_1uEOTXgBNQ",
        },
        {
          type: "edge",
          key: "Router_Q1uTcWa1rZ/else/Answer_za0cCTiayv",
          from: "Router_Q1uTcWa1rZ/else",
          to: "Answer_za0cCTiayv",
        },
        {
          type: "edge",
          key: "Code_MlXFPNEphR/Router_Q1uTcWa1rZ",
          from: "Code_MlXFPNEphR",
          to: "Router_Q1uTcWa1rZ",
        },
        {
          type: "edge",
          key: "Code_1uEOTXgBNQ/Iterating_CsvbR5teUm",
          from: "Code_1uEOTXgBNQ",
          to: "Iterating_CsvbR5teUm",
        },
        {
          type: "agent",
          key: "Iterating_CsvbR5teUm/Agent_DiQbU6FKZ6",
          from: "Iterating_CsvbR5teUm",
          to: "Agent_DiQbU6FKZ6",
        },
        {
          type: "edge",
          key: "Iterating_CsvbR5teUm/Answer_SowVtmiosK",
          from: "Iterating_CsvbR5teUm",
          to: "Answer_SowVtmiosK",
        },
      ],
    }

    const key = 'Agent_xv0UeM91O6'
    const workflowNodes = allChannels(graph as TXpertGraph, key)
    expect(workflowNodes).toEqual(expect.arrayContaining([
      'Agent_xv0UeM91O6',
      'Knowledge_PJ2H5EObqJ',
      'Code_1uEOTXgBNQ',
      'Iterating_CsvbR5teUm',
      'Answer_SowVtmiosK',
    ]))

    expect(workflowNodes).toEqual(expect.not.arrayContaining(['Router_Q1uTcWa1rZ']))
  })
})
