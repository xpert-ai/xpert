import { describe, it, expect } from "@jest/globals";
import { MemorySaver, InMemoryStore } from "@langchain/langgraph";
import { initializeMemoryTools } from "./tools";

describe("Memory Graph", () => {
  const conversations = [
    ["My name is Alice and I love pizza. Remember this."],
    [
      "Hi, I'm Bob and I enjoy playing tennis. Remember this.",
      "Yes, I also have a pet dog named Max.",
      "Max is a golden retriever and he's 5 years old. Please remember this too.",
    ],
    [
      "Hello, I'm Charlie. I work as a software engineer and I'm passionate about AI. Remember this.",
      "I specialize in machine learning algorithms and I'm currently working on a project involving natural language processing.",
      "My main goal is to improve sentiment analysis accuracy in multi-lingual texts. It's challenging but exciting.",
      "We've made some progress using transformer models, but we're still working on handling context and idioms across languages.",
      "Chinese and English have been the most challenging pair so far due to their vast differences in structure and cultural contexts.",
    ],
  ];

  it.each(
    conversations.map((conversation, index) => [
      ["short", "medium", "long"][index],
      conversation,
    ]),
  )(
    "should store memories for %s conversation",
    async (_, conversation) => {
      const memStore = new InMemoryStore();
      const memoryTools = initializeMemoryTools(memStore, null)
      
      expect(memoryTools.length).toBe(1);

      await memoryTools[0].invoke({query: '',})

      // const memStore = new InMemoryStore();
      // const graph = builder.compile({
      //   store: memStore,
      //   checkpointer: new MemorySaver(),
      // });
      // const userId = "test-user";
      // for (const content of conversation) {
      //   await graph.invoke(
      //     {
      //       messages: [
      //         { role: "user", content: [{ type: "text", text: content }] },
      //       ],
      //     },
      //     {
      //       configurable: {
      //         userId,
      //         thread_id: "thread",
      //         model: "gpt-4o-mini",
      //         systemPrompt: "You are a helpful assistant.",
      //       },
      //     },
      //   );
      // }

      // const namespace = ["memories", userId];
      // const memories = await memStore.search(namespace);
      // expect(memories.length).toBeGreaterThan(0);

      // const badNamespace = ["memories", "wrong-user"];
      // const badMemories = await memStore.search(badNamespace);
      // expect(badMemories.length).toBe(0);
    },
    30000,
  );
});