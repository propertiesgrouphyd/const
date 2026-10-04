"use strict";

/*
 * CONSTITUTION 365
 * Groq API Client
 *
 * Responsibilities:
 *  - Read GROQ_API_KEY from environment
 *  - Send the generated lesson prompt to Groq
 *  - Request structured JSON
 *  - Parse the response safely
 *  - Retry temporary API failures
 *
 * This file does NOT:
 *  - read syllabus files
 *  - choose the day
 *  - validate lesson quality
 *  - write JSON files
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const DEFAULT_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const MAX_RETRIES = 3;

const RETRY_DELAYS = [
  2000,
  5000,
  10000
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getApiKey() {
  const key = process.env.GROQ_API_KEY;

  if (!key || !key.trim()) {
    throw new Error(
      "GROQ_API_KEY is missing. Set it as an environment variable or GitHub Secret."
    );
  }

  return key.trim();
}

function extractMessageContent(data) {
  if (
    !data ||
    !data.choices ||
    !Array.isArray(data.choices) ||
    !data.choices[0] ||
    !data.choices[0].message
  ) {
    throw new Error(
      "Groq response does not contain a valid assistant message."
    );
  }

  const content = data.choices[0].message.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new Error(
      "Groq returned an empty lesson response."
    );
  }

  return content.trim();
}

function removeMarkdownCodeFence(text) {
  let value = text.trim();

  if (value.startsWith("```")) {
    value = value.replace(/^```(?:json)?\s*/i, "");
    value = value.replace(/\s*```$/i, "");
  }

  return value.trim();
}

function parseJsonResponse(content) {
  const cleaned = removeMarkdownCodeFence(content);

  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    /*
     * Sometimes a model can accidentally place a small amount of text
     * before or after the JSON. Try to recover only if there is a clear
     * JSON object boundary.
     */

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const possibleJson = cleaned.slice(
        firstBrace,
        lastBrace + 1
      );

      try {
        return JSON.parse(possibleJson);
      } catch (secondError) {
        throw new Error(
          `Groq returned invalid JSON. Original parse error: ${firstError.message}`
        );
      }
    }

    throw new Error(
      `Groq returned invalid JSON: ${firstError.message}`
    );
  }
}

function isRetryableStatus(status) {
  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

async function callGroq(prompt, options = {}) {
  const apiKey = getApiKey();

  const model =
    options.model ||
    DEFAULT_MODEL;

  const temperature =
    typeof options.temperature === "number"
      ? options.temperature
      : 0.35;

  const maxTokens =
    Number.isInteger(options.maxTokens) &&
    options.maxTokens > 0
      ? options.maxTokens
      : 8000;

  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(
        GROQ_API_URL,
        {
          method: "POST",

          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            model,

            messages: [
              {
                role: "system",
                content:
                  "You are an expert constitutional educator and exceptionally careful Telugu editor. Follow the user's JSON output requirements exactly. Constitutional accuracy and natural Telugu are mandatory."
              },
              {
                role: "user",
                content: prompt
              }
            ],

            temperature,

            max_tokens: maxTokens,

            response_format: {
              type: "json_object"
            }
          })
        }
      );

      const rawText = await response.text();

      let data;

      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(
          `Groq returned a non-JSON HTTP response. HTTP ${response.status}.`
        );
      }

      if (!response.ok) {
        const apiMessage =
          data &&
          data.error &&
          data.error.message
            ? data.error.message
            : `Groq API request failed with HTTP ${response.status}.`;

        const error = new Error(apiMessage);
        error.status = response.status;

        if (
          attempt < MAX_RETRIES &&
          isRetryableStatus(response.status)
        ) {
          lastError = error;

          await sleep(
            RETRY_DELAYS[
              Math.min(attempt, RETRY_DELAYS.length - 1)
            ]
          );

          continue;
        }

        throw error;
      }

      const content =
        extractMessageContent(data);

      return parseJsonResponse(content);

    } catch (error) {
      lastError = error;

      /*
       * Network errors do not have an HTTP status.
       * Retry them because GitHub Actions can occasionally encounter
       * temporary network failures.
       */

      const shouldRetry =
        attempt < MAX_RETRIES &&
        (
          !error.status ||
          isRetryableStatus(error.status)
        );

      if (!shouldRetry) {
        throw error;
      }

      await sleep(
        RETRY_DELAYS[
          Math.min(attempt, RETRY_DELAYS.length - 1)
        ]
      );
    }
  }

  throw (
    lastError ||
    new Error("Groq request failed after all retries.")
  );
}

module.exports = {
  callGroq
};
