export interface GeminiPart {
  text: string;
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiResponse {
  candidates: {
    content: GeminiContent;
  }[];
}
