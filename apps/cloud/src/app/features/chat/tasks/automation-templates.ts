import { TaskFrequency, type TScheduleOptions } from '../../../@core'

export type AutomationTemplate = {
  key: string
  titleKey: string
  title: string
  descriptionKey: string
  description: string
  promptKey: string
  prompt: string
  icon: string
  options: TScheduleOptions
}

export const AUTOMATION_TEMPLATES: readonly AutomationTemplate[] = [
  {
    key: 'daily-ai-news',
    titleKey: 'XP.Chat.AutomationTemplates.DailyAiNews.Title',
    title: 'Daily AI news',
    descriptionKey: 'XP.Chat.AutomationTemplates.DailyAiNews.Description',
    description: 'A concise briefing of the most important AI news each morning.',
    promptKey: 'XP.Chat.AutomationTemplates.DailyAiNews.Prompt',
    prompt:
      'Summarize the most important AI news from the last 24 hours. Explain why each item matters and include source links when available.',
    icon: 'ri-news-line',
    options: { frequency: TaskFrequency.Daily, time: '08:30' }
  },
  {
    key: 'daily-english-words',
    titleKey: 'XP.Chat.AutomationTemplates.DailyEnglishWords.Title',
    title: 'Five English words a day',
    descriptionKey: 'XP.Chat.AutomationTemplates.DailyEnglishWords.Description',
    description: 'Learn five practical English words with examples every day.',
    promptKey: 'XP.Chat.AutomationTemplates.DailyEnglishWords.Prompt',
    prompt:
      'Teach me five practical English words. For each word include pronunciation, a concise definition, one example sentence, and a short memory tip.',
    icon: 'ri-translate-2',
    options: { frequency: TaskFrequency.Daily, time: '07:30' }
  },
  {
    key: 'bedtime-story',
    titleKey: 'XP.Chat.AutomationTemplates.BedtimeStory.Title',
    title: 'Daily bedtime story',
    descriptionKey: 'XP.Chat.AutomationTemplates.BedtimeStory.Description',
    description: 'Create a calm three-to-five-minute bedtime story for children.',
    promptKey: 'XP.Chat.AutomationTemplates.BedtimeStory.Prompt',
    prompt:
      'Write a warm bedtime story for a child that takes three to five minutes to read. Keep it gentle, imaginative, and suitable for winding down.',
    icon: 'ri-moon-clear-line',
    options: { frequency: TaskFrequency.Daily, time: '20:30' }
  },
  {
    key: 'weekly-work-report',
    titleKey: 'XP.Chat.AutomationTemplates.WeeklyWorkReport.Title',
    title: 'Weekly work report',
    descriptionKey: 'XP.Chat.AutomationTemplates.WeeklyWorkReport.Description',
    description: "Turn the week's progress, risks, and next steps into a report.",
    promptKey: 'XP.Chat.AutomationTemplates.WeeklyWorkReport.Prompt',
    prompt:
      'Prepare my weekly work report. Organize it into completed work, measurable outcomes, open risks, decisions needed, and priorities for next week.',
    icon: 'ri-clipboard-line',
    options: { frequency: TaskFrequency.Weekly, time: '17:30', dayOfWeek: 5 }
  },
  {
    key: 'classic-movie',
    titleKey: 'XP.Chat.AutomationTemplates.ClassicMovie.Title',
    title: 'Classic movie recommendation',
    descriptionKey: 'XP.Chat.AutomationTemplates.ClassicMovie.Description',
    description: 'Recommend one acclaimed classic with a spoiler-free introduction.',
    promptKey: 'XP.Chat.AutomationTemplates.ClassicMovie.Prompt',
    prompt:
      'Recommend one acclaimed classic movie. Include a spoiler-free premise, why it is worth watching, its style, and who is most likely to enjoy it.',
    icon: 'ri-movie-2-line',
    options: { frequency: TaskFrequency.Weekly, time: '19:00', dayOfWeek: 6 }
  },
  {
    key: 'today-in-history',
    titleKey: 'XP.Chat.AutomationTemplates.TodayInHistory.Title',
    title: 'Today in history',
    descriptionKey: 'XP.Chat.AutomationTemplates.TodayInHistory.Description',
    description: 'Discover one meaningful event that happened on this date.',
    promptKey: 'XP.Chat.AutomationTemplates.TodayInHistory.Prompt',
    prompt:
      "Choose one meaningful event that happened on today's date. Explain the context, what happened, and its longer-term impact in a concise narrative.",
    icon: 'ri-calendar-event-line',
    options: { frequency: TaskFrequency.Daily, time: '08:00' }
  },
  {
    key: 'daily-why',
    titleKey: 'XP.Chat.AutomationTemplates.DailyWhy.Title',
    title: 'One why a day',
    descriptionKey: 'XP.Chat.AutomationTemplates.DailyWhy.Description',
    description: 'Explore one curious everyday question with a clear explanation.',
    promptKey: 'XP.Chat.AutomationTemplates.DailyWhy.Prompt',
    prompt:
      'Ask one interesting why-question about science, technology, society, or everyday life, then answer it clearly with a concrete example.',
    icon: 'ri-lightbulb-flash-line',
    options: { frequency: TaskFrequency.Daily, time: '18:30' }
  },
  {
    key: 'meeting-preparation',
    titleKey: 'XP.Chat.AutomationTemplates.MeetingPreparation.Title',
    title: 'Meeting preparation',
    descriptionKey: 'XP.Chat.AutomationTemplates.MeetingPreparation.Description',
    description: 'Prepare objectives, talking points, and decisions before meetings.',
    promptKey: 'XP.Chat.AutomationTemplates.MeetingPreparation.Prompt',
    prompt:
      'Prepare a concise meeting brief with the objective, context, agenda, key questions, decisions required, and a checklist of materials to bring.',
    icon: 'ri-list-check-3',
    options: { frequency: TaskFrequency.Daily, time: '08:45' }
  },
  {
    key: 'interview-preparation',
    titleKey: 'XP.Chat.AutomationTemplates.InterviewPreparation.Title',
    title: 'Interview preparation',
    descriptionKey: 'XP.Chat.AutomationTemplates.InterviewPreparation.Description',
    description: 'Review interview topics and practice one focused question each day.',
    promptKey: 'XP.Chat.AutomationTemplates.InterviewPreparation.Prompt',
    prompt:
      'Create a focused interview preparation session with one common question, a strong answer structure, likely follow-ups, and a short practice exercise.',
    icon: 'ri-chat-3-line',
    options: { frequency: TaskFrequency.Daily, time: '09:00' }
  }
]
