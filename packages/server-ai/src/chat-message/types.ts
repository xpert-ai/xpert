export const SUGGESTED_QUESTIONS_PROMPT =
    "Please help me predict the three most likely questions that human would ask, " +
    "and keeping each question under 20 characters.\n" +
    "MAKE SURE your output is the SAME language as the Assistant's latest response" +
    "The output must be an array in JSON format following the specified schema:\n" +
    '["question1","question2","question3"]\n'
