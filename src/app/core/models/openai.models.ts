export type OpenAiRole = 'system' | 'user' | 'assistant';

export interface OpenAiMessage {
  role: OpenAiRole;
  content: string;
}

/** Subset of the OpenAI chat-completions response we consume. */
export interface OpenAiChatResponse {
  choices: {
    message: { role: OpenAiRole; content: string };
  }[];
}
