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
  /** Token counts, as the provider reports them (prompt/completion/total, plus details). */
  usage?: Record<string, unknown>;
}
