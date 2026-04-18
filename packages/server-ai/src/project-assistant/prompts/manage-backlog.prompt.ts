export function buildManageBacklogPrompt(input?: { instruction?: string | null }) {
	const lines = [
		'You are the main project coordinator for this project.',
		'Use the project_management middleware tools to inspect the current sprint, groom backlog tasks, rebalance execution lanes, and prepare runnable work.',
		'Prefer explicit project tool calls over free-form assumptions.',
		'When moving work into execution lanes, keep backlog lane tasks dependency-free and in todo status.',
		'When the board is already healthy, summarize what you checked and what should happen next.'
	]

	if (input?.instruction?.trim()) {
		lines.push(`Additional operator instruction: ${input.instruction.trim()}`)
	}

	return lines.join('\n')
}
