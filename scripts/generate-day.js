"use strict";

/*
 * CONSTITUTION 365
 * Daily Lesson Generator
 *
 * Flow:
 *
 * syllabus.json
 *      ↓
 * constitutional-sources.json
 *      ↓
 * prompt-builder.js
 *      ↓
 * Groq
 *      ↓
 * validate-day.js
 *      ↓
 * quality-check.js
 *      ↓
 * PASS → data/day-XXX.json
 * FAIL → regenerate
 *
 * Usage:
 *
 *   node scripts/generate-day.js 1
 *
 * Force regeneration:
 *
 *   node scripts/generate-day.js 1 --force
 *
 * Environment:
 *
 *   GROQ_API_KEY=...
 *   GROQ_MODEL=...           optional
 *   MAX_GENERATION_ATTEMPTS=5 optional
 */

const fs = require("fs");
const path = require("path");

const {
  buildPrompt
} = require("./prompt-builder");

const {
  callGroq
} = require("./groq");

const {
  validateDay
} = require("./validate-day");

const {
  checkQuality
} = require("./quality-check");


/*
 * ------------------------------------------------------------
 * PATHS
 * ------------------------------------------------------------
 */

const ROOT_DIR =
  path.resolve(__dirname, "..");

const DATA_DIR =
  path.join(ROOT_DIR, "data");

const SYLLABUS_PATH =
  path.join(
    DATA_DIR,
    "syllabus.json"
  );

const SOURCE_MAP_PATH =
  path.join(
    DATA_DIR,
    "constitutional-sources.json"
  );


/*
 * ------------------------------------------------------------
 * CONFIGURATION
 * ------------------------------------------------------------
 */

const MIN_DAY = 1;
const MAX_DAY = 365;

const DEFAULT_MAX_ATTEMPTS = 5;

const MAX_GENERATION_ATTEMPTS =
  Number(
    process.env.MAX_GENERATION_ATTEMPTS ||
    DEFAULT_MAX_ATTEMPTS
  );

const FORCE =
  process.argv.includes("--force");


/*
 * ------------------------------------------------------------
 * FILE HELPERS
 * ------------------------------------------------------------
 */

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Required file not found: ${filePath}`
    );
  }

  const content =
    fs.readFileSync(
      filePath,
      "utf8"
    );

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${filePath}: ${error.message}`
    );
  }
}


function writeJson(
  filePath,
  data
) {
  fs.mkdirSync(
    path.dirname(filePath),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    filePath,
    JSON.stringify(
      data,
      null,
      2
    ) + "\n",
    "utf8"
  );
}


/*
 * ------------------------------------------------------------
 * SYLLABUS HELPERS
 * ------------------------------------------------------------
 */

function getSyllabusEntries(
  syllabus
) {
  if (Array.isArray(syllabus)) {
    return syllabus;
  }

  if (
    syllabus &&
    Array.isArray(syllabus.days)
  ) {
    return syllabus.days;
  }

  throw new Error(
    "syllabus.json must be an array or contain a days array."
  );
}


function getSyllabusEntry(
  syllabus,
  day
) {
  const entries =
    getSyllabusEntries(
      syllabus
    );

  return entries.find(
    entry =>
      Number(entry.day) === day
  );
}


/*
 * ------------------------------------------------------------
 * SOURCE MAP HELPERS
 * ------------------------------------------------------------
 */

function getSourceDay(
  sourceMap,
  day
) {
  if (
    !sourceMap ||
    typeof sourceMap !== "object"
  ) {
    return null;
  }

  if (
    sourceMap.days &&
    typeof sourceMap.days === "object"
  ) {
    return (
      sourceMap.days[String(day)] ||
      sourceMap.days[day] ||
      null
    );
  }

  return null;
}


/*
 * ------------------------------------------------------------
 * DAY VALIDATION
 * ------------------------------------------------------------
 */

function parseDayArgument() {
  const args =
    process.argv.slice(2);

  const dayArgument =
    args.find(
      arg =>
        /^\d+$/.test(arg)
    );

  if (!dayArgument) {
    throw new Error(
      "Missing day number. Example: node scripts/generate-day.js 1"
    );
  }

  const day =
    Number(dayArgument);

  if (
    !Number.isInteger(day) ||
    day < MIN_DAY ||
    day > MAX_DAY
  ) {
    throw new Error(
      `Day must be an integer from ${MIN_DAY} to ${MAX_DAY}.`
    );
  }

  return day;
}


/*
 * ------------------------------------------------------------
 * OUTPUT PATH
 * ------------------------------------------------------------
 */

function getDayFilePath(day) {
  const filename =
    `day-${String(day).padStart(3, "0")}.json`;

  return path.join(
    DATA_DIR,
    filename
  );
}


/*
 * ------------------------------------------------------------
 * EXISTING FILE CHECK
 * ------------------------------------------------------------
 */

function shouldSkipExistingFile(
  outputPath
) {
  if (!fs.existsSync(outputPath)) {
    return false;
  }

  if (FORCE) {
    return false;
  }

  return true;
}


/*
 * ------------------------------------------------------------
 * GENERATION CONTEXT
 * ------------------------------------------------------------
 */

function buildGenerationContext({
  syllabusEntry,
  sourceDay,
  previousResult,
  attempt
}) {
  const context = {
    syllabus: syllabusEntry,
    sourceMap: sourceDay
  };

  /*
   * If a previous generation failed validation,
   * give Groq the failure information so that the
   * next attempt can correct the specific problems.
   */

  if (previousResult) {
    context.previousAttempt = {
      attempt,
      validation_errors:
        previousResult.validation
          ? previousResult.validation.errors
          : [],
      validation_warnings:
        previousResult.validation
          ? previousResult.validation.warnings
          : [],
      quality_errors:
        previousResult.quality
          ? previousResult.quality.errors
          : [],
      quality_warnings:
        previousResult.quality
          ? previousResult.quality.warnings
          : [],
      quality_score:
        previousResult.quality
          ? previousResult.quality.score
          : null
    };
  }

  return context;
}


/*
 * ------------------------------------------------------------
 * PROMPT WITH RETRY FEEDBACK
 * ------------------------------------------------------------
 */

function buildGenerationPrompt({
  syllabusEntry,
  sourceDay,
  previousResult,
  attempt
}) {
  const basePrompt =
    buildPrompt({
      syllabus: syllabusEntry,
      sourceMap: sourceDay
    });

  if (!previousResult) {
    return basePrompt;
  }

  const validation =
    previousResult.validation || {};

  const quality =
    previousResult.quality || {};

  const errors = [
    ...(validation.errors || []),
    ...(quality.errors || [])
  ];

  const warnings = [
    ...(validation.warnings || []),
    ...(quality.warnings || [])
  ];

  const feedback = `
REGENERATION ATTEMPT: ${attempt}

The previous generated lesson failed the local quality gates.

You MUST correct these problems in the new JSON.

ERRORS:
${errors.length
  ? errors.map(item => `- ${item}`).join("\n")
  : "- None"}

WARNINGS:
${warnings.length
  ? warnings.map(item => `- ${item}`).join("\n")
  : "- None"}

PREVIOUS QUALITY SCORE:
${quality.score ?? "Not available"}

Do not explain the corrections.
Return ONLY the corrected final JSON object.
`;

  return `${basePrompt}\n\n${feedback}`;
}


/*
 * ------------------------------------------------------------
 * NORMALIZE GENERATED RESULT
 * ------------------------------------------------------------
 */

function normalizeGeneratedLesson(
  generated,
  syllabusEntry
) {
  if (
    !generated ||
    typeof generated !== "object"
  ) {
    throw new Error(
      "Groq returned an invalid lesson object."
    );
  }

  /*
   * Keep the authoritative day/title/stage
   * from syllabus rather than trusting the model
   * to reproduce them exactly.
   */

  return {
    ...generated,

    day:
      Number(syllabusEntry.day),

    title:
      syllabusEntry.title,

    stage:
      syllabusEntry.stage
  };
}


/*
 * ------------------------------------------------------------
 * SINGLE GENERATION ATTEMPT
 * ------------------------------------------------------------
 */

async function generateAttempt({
  syllabusEntry,
  sourceDay,
  previousResult,
  attempt
}) {
  console.log(
    `\n------------------------------------------`
  );

  console.log(
    `GENERATION ATTEMPT ${attempt}/${MAX_GENERATION_ATTEMPTS}`
  );

  console.log(
    `DAY: ${syllabusEntry.day}`
  );

  console.log(
    `TITLE: ${syllabusEntry.title}`
  );

  console.log(
    `------------------------------------------`
  );

  const prompt =
    buildGenerationPrompt({
      syllabusEntry,
      sourceDay,
      previousResult,
      attempt
    });

  console.log(
    "Calling Groq..."
  );

  const generated =
    await callGroq(
      prompt
    );

  console.log(
    "Groq response received."
  );

  const normalized =
    normalizeGeneratedLesson(
      generated,
      syllabusEntry
    );

  /*
   * --------------------------------------------------------
   * STRUCTURAL / CONSTITUTIONAL VALIDATION
   * --------------------------------------------------------
   */

  console.log(
    "Running structural validation..."
  );

  const validation =
    validateDay({
      generated: normalized,
      syllabus: syllabusEntry,
      sourceMap: sourceDay
    });

  /*
   * --------------------------------------------------------
   * EDITORIAL QUALITY VALIDATION
   * --------------------------------------------------------
   */

  console.log(
    "Running editorial quality check..."
  );

  const quality =
    checkQuality({
      generated: normalized,
      syllabus: syllabusEntry
    });

  const result = {
    generated: normalized,
    validation,
    quality
  };

  console.log(
    `Structural validation: ${
      validation.valid
        ? "PASS"
        : "FAIL"
    }`
  );

  console.log(
    `Editorial quality: ${
      quality.valid
        ? "PASS"
        : "FAIL"
    }`
  );

  console.log(
    `Quality score: ${quality.score}/100`
  );

  if (
    validation.errors &&
    validation.errors.length
  ) {
    console.log(
      "\nValidation errors:"
    );

    for (
      const error of validation.errors
    ) {
      console.log(
        `  ✗ ${error}`
      );
    }
  }

  if (
    quality.errors &&
    quality.errors.length
  ) {
    console.log(
      "\nQuality errors:"
    );

    for (
      const error of quality.errors
    ) {
      console.log(
        `  ✗ ${error}`
      );
    }
  }

  if (
    validation.warnings &&
    validation.warnings.length
  ) {
    console.log(
      "\nValidation warnings:"
    );

    for (
      const warning of validation.warnings
    ) {
      console.log(
        `  ! ${warning}`
      );
    }
  }

  if (
    quality.warnings &&
    quality.warnings.length
  ) {
    console.log(
      "\nQuality warnings:"
    );

    for (
      const warning of quality.warnings
    ) {
      console.log(
        `  ! ${warning}`
      );
    }
  }

  return result;
}


/*
 * ------------------------------------------------------------
 * MAIN GENERATION PROCESS
 * ------------------------------------------------------------
 */

async function generateDay(day) {
  console.log(
    "\n=========================================="
  );

  console.log(
    "CONSTITUTION 365 — DAILY GENERATOR"
  );

  console.log(
    "=========================================="
  );

  console.log(
    `Requested day: ${day}`
  );

  /*
   * --------------------------------------------------------
   * LOAD SOURCE FILES
   * --------------------------------------------------------
   */

  console.log(
    "\nLoading syllabus..."
  );

  const syllabus =
    readJson(
      SYLLABUS_PATH
    );

  console.log(
    "Loading constitutional source map..."
  );

  const sourceMap =
    readJson(
      SOURCE_MAP_PATH
    );

  const syllabusEntry =
    getSyllabusEntry(
      syllabus,
      day
    );

  if (!syllabusEntry) {
    throw new Error(
      `Day ${day} was not found in syllabus.json.`
    );
  }

  const sourceDay =
    getSourceDay(
      sourceMap,
      day
    );

  if (!sourceDay) {
    throw new Error(
      `Day ${day} was not found in constitutional-sources.json.`
    );
  }

  console.log(
    `\nDay ${day}: ${syllabusEntry.title}`
  );

  console.log(
    `Stage: ${syllabusEntry.stage}`
  );

  /*
   * --------------------------------------------------------
   * CHECK EXISTING OUTPUT
   * --------------------------------------------------------
   */

  const outputPath =
    getDayFilePath(day);

  if (
    shouldSkipExistingFile(
      outputPath
    )
  ) {
    console.log(
      `\nExisting lesson found: ${outputPath}`
    );

    console.log(
      "Skipping generation."
    );

    console.log(
      "Use --force to regenerate."
    );

    return {
      success: true,
      skipped: true,
      path: outputPath
    };
  }

  /*
   * --------------------------------------------------------
   * RETRY LOOP
   * --------------------------------------------------------
   */

  let previousResult =
    null;

  for (
    let attempt = 1;
    attempt <= MAX_GENERATION_ATTEMPTS;
    attempt++
  ) {
    try {
      const result =
        await generateAttempt({
          syllabusEntry,
          sourceDay,
          previousResult,
          attempt
        });

      /*
       * Both gates must pass.
       */

      const structuralPass =
        Boolean(
          result.validation &&
          result.validation.valid
        );

      const qualityPass =
        Boolean(
          result.quality &&
          result.quality.valid
        );

      if (
        structuralPass &&
        qualityPass
      ) {
        console.log(
          "\n=========================================="
        );

        console.log(
          "LESSON ACCEPTED"
        );

        console.log(
          "=========================================="
        );

        console.log(
          `Quality score: ${result.quality.score}/100`
        );

        console.log(
          `Writing: ${outputPath}`
        );

        /*
         * Write only after BOTH gates pass.
         */

        writeJson(
          outputPath,
          result.generated
        );

        console.log(
          "Lesson saved successfully."
        );

        console.log(
          `File: ${outputPath}`
        );

        return {
          success: true,
          skipped: false,
          path: outputPath,
          score:
            result.quality.score
        };
      }

      /*
       * Failed attempt.
       *
       * Save the complete result in memory so
       * the next prompt can contain precise feedback.
       */

      previousResult =
        result;

      if (
        attempt <
        MAX_GENERATION_ATTEMPTS
      ) {
        console.log(
          `\nAttempt ${attempt} failed.`
        );

        console.log(
          "Regenerating with correction feedback..."
        );
      }

    } catch (error) {
      console.error(
        `\nAttempt ${attempt} error: ${error.message}`
      );

      previousResult = {
        validation: {
          errors: [
            `Generation error: ${error.message}`
          ],
          warnings: []
        },
        quality: {
          errors: [],
          warnings: [],
          score: 0
        }
      };

      if (
        attempt <
        MAX_GENERATION_ATTEMPTS
      ) {
        console.log(
          "Retrying..."
        );
      }
    }
  }

  /*
   * --------------------------------------------------------
   * ALL ATTEMPTS FAILED
   * --------------------------------------------------------
   */

  throw new Error(
    `Day ${day} could not pass all quality gates after ${MAX_GENERATION_ATTEMPTS} attempts.`
  );
}


/*
 * ------------------------------------------------------------
 * CLI
 * ------------------------------------------------------------
 */

async function main() {
  const day =
    parseDayArgument();

  if (
    !process.env.GROQ_API_KEY
  ) {
    throw new Error(
      "GROQ_API_KEY environment variable is not set."
    );
  }

  await generateDay(day);
}


/*
 * ------------------------------------------------------------
 * EXPORT
 * ------------------------------------------------------------
 */

module.exports = {
  generateDay,
  getDayFilePath
};


/*
 * ------------------------------------------------------------
 * RUN CLI
 * ------------------------------------------------------------
 */

if (
  require.main === module
) {
  main()
    .then(() => {
      console.log(
        "\nGeneration process completed."
      );
    })
    .catch(error => {
      console.error(
        `\nGENERATION FAILED: ${error.message}`
      );

      process.exit(1);
    });
}
