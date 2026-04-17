// Model pricing (USD per 1M tokens) - 2026-04 rates
export const MODEL_PRICING = {
  // Claude
  "claude-opus-4-7":   { input: 5.00,  output: 25.00 },
  "claude-sonnet-4-6": { input: 3.00,  output: 15.00 },
  // OpenAI
  "gpt-5.4":           { input: 2.50,  output: 15.00 },
  "gpt-5.4-mini":      { input: 0.75,  output: 4.50  },
  // Gemini
  "gemini-2.5-pro":    { input: 1.25,  output: 10.00 },
  "gemini-2.5-flash":  { input: 0.30,  output: 2.50  },
};

export function calcCostUSD(model, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
}

export function detectProvider(model) {
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gpt")) return "openai";
  if (model.startsWith("gemini")) return "google";
  return null;
}
