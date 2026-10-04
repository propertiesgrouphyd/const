"use strict";

/*
 * CONSTITUTION 365
 * Daily Lesson Generator
 *
 * Pipeline:
 *
 * syllabus.json
 *       ↓
 * constitutional-sources.json
 *       ↓
 * source-map.js
 *       ↓
 * prompt-builder.js
 *       ↓
 * Groq
 *       ↓
 * validate-day.js
 *       ↓
 * quality-check.js
 *       ↓
 * PASS → data/day-XXX.json
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
 *   GROQ_MODEL=...
 *   MAX_GENERATION_ATTEMPTS=5
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

const {
  loadSourceMap,
  getNormalizedDaySource,
  validateSourceMap
} = require("./source-map");


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
 * BASIC HELPERS
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
 * SYLLABUS
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


function validateSyllabus(
  syllabus
) {
  const errors = [];

  let entries;

  try {
    entries =
      getSyllabusEntries(
        syllabus
      );
  } catch (error) {
    return {
      valid: false,
      errors: [
        error.message
      ]
    };
  }

  if (
    entries.length !== 365
  ) {
    errors.push(
      `Syllabus must contain exactly 365 days; found ${entries.length}.`
    );
  }

  const seen =
    new Set();

  for (
    const entry of entries
  ) {
    if (
      !entry ||
      typeof entry !== "object"
    ) {
      errors.push(
        "Syllabus contains an invalid entry."
      );

      continue;
    }

    const day =
      Number(entry.day);

    if (
      !Number.isInteger(day) ||
      day < MIN_DAY ||
      day > MAX_DAY
    ) {
      errors.push(
        `Invalid syllabus day: ${entry.day}`
      );

      continue;
    }

    if (seen.has(day)) {
      errors.push(
        `Duplicate syllabus day: ${day}`
      );
    }

    seen.add(day);

    if (
      typeof entry.title !== "string" ||
      !entry.title.trim()
    ) {
      errors.push(
        `Day ${day}: missing title.`
      );
    }

    if (
      typeof entry.stage !== "string" ||
      !entry.stage.trim()
    ) {
      errors.push(
        `Day ${day}: missing stage.`
      );
    }

    if (
      typeof entry.focus !== "string" ||
      !entry.focus.trim()
    ) {
      errors.push(
        `Day ${day}: missing focus.`
      );
    }
  }

  for (
    let day = MIN_DAY;
    day <= MAX_DAY;
    day++
  ) {
    if (!seen.has(day)) {
      errors.push(
        `Missing syllabus day: ${day}`
      );
    }
  }

  return {
    valid:
      errors.length === 0,
    errors
  };
}


/*
 * ------------------------------------------------------------
 * DAY ARGUMENT
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
 * EXISTING FILE
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
 * SOURCE MAP INTEGRITY
 * ------------------------------------------------------------
 */

function verifySourceForDay(
  sourceMap,
  day
) {
  const source =
    getNormalizedDaySource(
      sourceMap,
      day
    );

  if (
    !source ||
    typeof source !== "object"
  ) {
    throw new Error(
      `No usable constitutional source found for day ${day}.`
    );
  }

  /*
   * At least one constitutional anchor should normally
   * exist. Some conceptual lessons can legitimately rely
   * primarily on references/notes.
   */

  const hasArticles =
    Array.isArray(source.articles) &&
    source.articles.length > 0;

  const hasParts =
    Array.isArray(source.parts) &&
    source.parts.length > 0;

  const hasReferences =
    Array.isArray(source.references) &&
    source.references.length > 0;

  if (
    !hasArticles &&
    !hasParts &&
    !hasReferences
  ) {
    throw new Error(
      `Day ${day} has no constitutional articles, parts or references in the source map.`
    );
  }

  return source;
}


/*
 * ------------------------------------------------------------
 * NORMALIZE MODEL OUTPUT
 * ------------------------------------------------------------
 *
 * The syllabus is authoritative for:
 * - day
 * - title
 * - stage
 *
 * The model must not accidentally change these.
 */

function normalizeGeneratedLesson(
  generated,
  syllabusEntry
) {
  if (
    !generated ||
    typeof generated !== "object" ||
    Array.isArray(generated)
  ) {
    throw new Error(
      "Groq returned an invalid lesson object."
    );
  }

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
 * RETRY FEEDBACK
 * ------------------------------------------------------------
 */

function buildRetryFeedback(
  result,
  attempt
) {
  const validation =
    result.validation || {};

  const quality =
    result.quality || {};

  const errors = [
    ...(validation.errors || []),
    ...(quality.errors || [])
  ];

  const warnings = [
    ...(validation.warnings || []),
    ...(quality.warnings || [])
  ];

  return `
REGENERATION ATTEMPT: ${attempt}

The previous lesson failed one or more local quality gates.

You must correct the problems below in the new lesson.

HARD ERRORS:
${
  errors.length
    ? errors
        .map(
          item =>
            `- ${item}`
        )
        .join("\n")
    : "- None"
}

WARNINGS:
${
  warnings.length
    ? warnings
        .map(
          item =>
            `- ${item}`
        )
        .join("\n")
    : "- None"
}

PREVIOUS QUALITY SCORE:
${
  typeof quality.score === "number"
    ? quality.score
    : "Not available"
}

Do not discuss these corrections.
Do not output commentary.
Return ONLY the corrected JSON object.
`;
}


/*
 * ------------------------------------------------------------
 * PROMPT
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

  return (
    basePrompt +
    "\n\n" +
    buildRetryFeedback(
      previousResult,
      attempt
    )
  );
}


/*
 * ------------------------------------------------------------
 * SINGLE ATTEMPT
 * ------------------------------------------------------------
 */

async function generateAttempt({
  syllabusEntry,
  sourceDay,
  previousResult,
  attempt
}) {
  console.log(
    "\n------------------------------------------"
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
    "------------------------------------------"
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
   * STRUCTURAL + CONSTITUTIONAL VALIDATION
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
   * EDITORIAL QUALITY
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

  return result;
}


/*
 * ------------------------------------------------------------
 * PRINT FAILURE DETAILS
 * ------------------------------------------------------------
 */

function printFailure(
  result
) {
  const validation =
    result.validation || {};

  const quality =
    result.quality || {};

  if (
    validation.errors &&
    validation.errors.length
  ) {
    console.log(
      "\nSTRUCTURAL / REFERENCE ERRORS:"
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
      "\nEDITORIAL QUALITY ERRORS:"
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
      "\nVALIDATION WARNINGS:"
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
      "\nQUALITY WARNINGS:"
    );

    for (
      const warning of quality.warnings
    ) {
      console.log(
        `  ! ${warning}`
      );
    }
  }
}


/*
 * ------------------------------------------------------------
 * MAIN GENERATION
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
   * LOAD SYLLABUS
   * --------------------------------------------------------
   */

  console.log(
    "\nLoading syllabus..."
  );

  const syllabus =
    readJson(
      SYLLABUS_PATH
    );

  /*
   * --------------------------------------------------------
   * VALIDATE COMPLETE SYLLABUS
   * --------------------------------------------------------
   */

  console.log(
    "Checking 365-day syllabus integrity..."
  );

  const syllabusCheck =
    validateSyllabus(
      syllabus
    );

  if (
    !syllabusCheck.valid
  ) {
    throw new Error(
      "Syllabus integrity check failed:\n" +
      syllabusCheck.errors
        .map(
          item =>
            `- ${item}`
        )
        .join("\n")
    );
  }

  console.log(
    "Syllabus integrity: PASS"
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

  /*
   * --------------------------------------------------------
   * LOAD + VALIDATE SOURCE MAP
   * --------------------------------------------------------
   */

  console.log(
    "Loading constitutional source map..."
  );

  const sourceMap =
    loadSourceMap();

  console.log(
    "Checking 365-day constitutional source map..."
  );

  const sourceMapCheck =
    validateSourceMap(
      sourceMap
    );

  if (
    !sourceMapCheck.valid
  ) {
    throw new Error(
      "Constitutional source-map integrity check failed:\n" +
      sourceMapCheck.errors
        .map(
          item =>
            `- ${item}`
        )
        .join("\n")
    );
  }

  console.log(
    "Source-map integrity: PASS"
  );

  const sourceDay =
    verifySourceForDay(
      sourceMap,
      day
    );

  /*
   * --------------------------------------------------------
   * DISPLAY DAY CONTEXT
   * --------------------------------------------------------
   */

  console.log(
    `\nDAY ${day}`
  );

  console.log(
    `TITLE: ${syllabusEntry.title}`
  );

  console.log(
    `STAGE: ${syllabusEntry.stage}`
  );

  console.log(
    `FOCUS: ${syllabusEntry.focus}`
  );

  console.log(
    "\nCONSTITUTIONAL SOURCE:"
  );

  console.log(
    `Parts: ${
      sourceDay.parts.length
        ? sourceDay.parts.join(", ")
        : "None specified"
    }`
  );

  console.log(
    `Articles: ${
      sourceDay.articles.length
        ? sourceDay.articles.join(", ")
        : "None specified"
    }`
  );

  /*
   * --------------------------------------------------------
   * OUTPUT
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

      /*
       * BOTH gates must pass.
       */

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
         * Only accepted lessons are written.
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
       * Failed generation.
       */

      previousResult =
        result;

      printFailure(
        result
      );

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
        `\nAttempt ${attempt} failed: ${error.message}`
      );

      previousResult = {
        validation: {
          valid: false,
          errors: [
            `Generation error: ${error.message}`
          ],
          warnings: []
        },

        quality: {
          valid: false,
          score: 0,
          errors: [],
          warnings: []
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

  throw new Error(
    `Day ${day} failed all ${MAX_GENERATION_ATTEMPTS} generation attempts. No lesson file was written.`
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

  if (
    !Number.isInteger(
      MAX_GENERATION_ATTEMPTS
    ) ||
    MAX_GENERATION_ATTEMPTS < 1
  ) {
    throw new Error(
      "MAX_GENERATION_ATTEMPTS must be a positive integer."
    );
  }

  await generateDay(
    day
  );
}


/*
 * ------------------------------------------------------------
 * EXPORTS
 * ------------------------------------------------------------
 */

module.exports = {
  generateDay,
  getDayFilePath,
  validateSyllabus
};


/*
 * ------------------------------------------------------------
 * CLI ENTRY
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
        `\nGENERATION FAILED:\n${error.message}`
      );

      process.exit(1);
    });
}
