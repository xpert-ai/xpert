import { ChatOpenAI } from '@langchain/openai'
import { Team } from 'apps/cloud/src/app/@core/copilot'

export async function createSupervisor(llm: ChatOpenAI, members: string[]) {
  const supervisorNode = await Team.createSupervisor(
    llm,
    members,
    'You are a supervisor tasked with managing a conversation between the' +
      ' following teams: {team_members}. Given the following user request,' +
      // `call the ${PLANNER_NAME} to get a plan steps firstly.` +
      `Create a plan then execute the plan steps one by one,` +
      ' by respond with the worker to act next. Each worker will perform a' +
      ' step task and respond with their results and status. When finished,' +
      ' respond with FINISH.\n\n' +
      // 'Current plan is {plan}.\n\n' +
      ' Select strategically to minimize the number of steps taken.',
  )

  return supervisorNode
}