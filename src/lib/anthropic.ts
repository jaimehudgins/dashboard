import Anthropic from "@anthropic-ai/sdk";

// Trim defensively — a stray newline/space pasted into the env var yields
// "invalid x-api-key".
const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

export const anthropic = new Anthropic({ apiKey });

export const isAnthropicConfigured = !!apiKey;
