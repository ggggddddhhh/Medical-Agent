import { OpenAICompatibleResponsesAdapter } from "./openai-compatible-responses-adapter.js";

export const DEEPSEEK_PROVIDER = "DeepSeek";
export const DEEPSEEK_V4_FLASH_MODEL = "deepseek-v4-flash";
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export function createDeepSeekV4FlashAdapter({
  apiKey = process.env.DEEPSEEK_API_KEY,
  fetchImpl = globalThis.fetch,
} = {}) {
  return new OpenAICompatibleResponsesAdapter({
    provider: DEEPSEEK_PROVIDER,
    apiKey,
    model: DEEPSEEK_V4_FLASH_MODEL,
    baseUrl: DEEPSEEK_BASE_URL,
    fetchImpl,
    includeStore: false,
    includeStrict: false,
    reasoningEffort: "none",
    temperature: 0,
  });
}
