export function buildManageBacklogPrompt(input?: {
	instruction?: string | null
	boundTeams?: Array<{ name: string; role?: string | null }> | null
}) {
	const lines = [
		'You are the main project coordinator for this project.',
		'Use the project_management middleware tools to inspect the current sprint, groom backlog tasks, rebalance execution lanes, and prepare runnable work.',
		'Inspect the currently bound teams before routing tasks, and set or adjust task teamId when a team should own execution.',
		'Prefer explicit project tool calls over free-form assumptions.',
		'When moving work into execution lanes, keep backlog lane tasks dependency-free and in todo status.',
		'When the board is already healthy, summarize what you checked and what should happen next.'
	]

	if (input?.boundTeams?.length) {
		lines.push(
			`Bound teams: ${input.boundTeams
				.map((team) => (team.role?.trim() ? `${team.name} (${team.role.trim()})` : team.name))
				.join(', ')}`
		)
	}

	if (input?.instruction?.trim()) {
		lines.push(`Additional operator instruction: ${input.instruction.trim()}`)
	}

	return lines.join('\n')
}
