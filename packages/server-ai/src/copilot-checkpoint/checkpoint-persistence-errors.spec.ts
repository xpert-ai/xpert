import { execFileSync } from 'node:child_process'

// Exercise the pinned LangGraph package in a separate strict Node process: Jest's
// rejection handlers must not conceal a process crash during a slow graph node.
describe.each(['cjs', 'esm'] as const)('background checkpoint failures (%s)', (format) => {
    it.each([
        ['put', 'async'],
        ['putWrites', 'async'],
        ['putWrites', 'exit']
    ] as const)('propagates %s rejection with %s durability without crashing Node', (method, durability) => {
        const entry = require.resolve('@langchain/langgraph')
        const load =
            format === 'cjs'
                ? `require(${JSON.stringify(entry)})`
                : `await import(${JSON.stringify(entry.replace(/\.cjs$/, '.js'))})`
        const script = `
            const assert = require('node:assert/strict');
            const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            (async () => {
                const { Annotation, StateGraph, START, END, MemorySaver, interrupt } = ${load};
                class RejectingSaver extends MemorySaver {
                    async ${method}() {
                        await delay(5);
                        throw new Error('checkpoint write refused');
                    }
                }
                const State = Annotation.Root({
                    value: Annotation({ reducer: (_, next) => next, default: () => 0 })
                });
                const graph = new StateGraph(State)
                    .addNode('work', async () => {
                        await delay(100);
                        if (${JSON.stringify(durability)} === 'exit') interrupt('pause');
                        return { value: 1 };
                    })
                    .addEdge(START, 'work')
                    .addEdge('work', END)
                    .compile({ checkpointer: new RejectingSaver() });
                await assert.rejects(graph.invoke({}, {
                    configurable: { thread_id: 'checkpoint-failure' },
                    durability: ${JSON.stringify(durability)}
                }), /checkpoint write refused/);
                await delay(20);
                process.stdout.write('failure propagated');
            })().catch((error) => { console.error(error); process.exitCode = 1; });
        `
        expect(
            execFileSync(process.execPath, ['--unhandled-rejections=strict', '-e', script], {
                encoding: 'utf8',
                timeout: 10000
            })
        ).toBe('failure propagated')
    })
})
