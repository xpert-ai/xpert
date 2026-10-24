/** Dependency depth orders steps inside a business stage. Cycles stay together, never spin or drop nodes. */
export function dependencyColumns(keys: string[], edges: Array<{ from: string; to: string }>) {
    const successors = new Map([...keys].sort().map((key) => [key, new Set<string>()]))
    for (const edge of edges)
        if (successors.has(edge.from) && successors.has(edge.to)) successors.get(edge.from)!.add(edge.to)
    const indices = new Map<string, number>(),
        low = new Map<string, number>()
    const stack: string[] = [],
        active = new Set<string>(),
        components: string[][] = []
    const visit = (key: string) => {
        indices.set(key, indices.size)
        low.set(key, indices.get(key)!)
        stack.push(key)
        active.add(key)
        for (const next of [...successors.get(key)!].sort()) {
            if (!indices.has(next)) {
                visit(next)
                low.set(key, Math.min(low.get(key)!, low.get(next)!))
            } else if (active.has(next)) low.set(key, Math.min(low.get(key)!, indices.get(next)!))
        }
        if (low.get(key) === indices.get(key)) {
            const component: string[] = []
            let next: string
            do {
                next = stack.pop()!
                active.delete(next)
                component.push(next)
            } while (next !== key)
            components.push(component.sort())
        }
    }
    for (const key of successors.keys()) if (!indices.has(key)) visit(key)
    const owner = new Map(components.flatMap((keys, index) => keys.map((key) => [key, index] as const)))
    const predecessors = components.map(() => new Set<number>())
    for (const [key, next] of successors)
        for (const target of next)
            if (owner.get(key) !== owner.get(target)) predecessors[owner.get(target)!].add(owner.get(key)!)
    const ranks = new Map<number, number>()
    const rank = (index: number): number => {
        if (!ranks.has(index))
            ranks.set(index, Math.max(0, ...[...predecessors[index]].map((parent) => rank(parent) + 1)))
        return ranks.get(index)!
    }
    return new Map(keys.map((key) => [key, rank(owner.get(key)!)]))
}
