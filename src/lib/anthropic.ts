import Anthropic from "@anthropic-ai/sdk";

// Reads ANTHROPIC_API_KEY from the environment.
export const anthropic = new Anthropic();

export const isAnthropicConfigured = !!process.env.ANTHROPIC_API_KEY;
