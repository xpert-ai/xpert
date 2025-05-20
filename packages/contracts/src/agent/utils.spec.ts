import { TXpertGraph } from '../ai/xpert.model'
import { DeepPartial, findStartNodes } from './utils'

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

})
