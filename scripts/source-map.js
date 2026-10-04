"use strict";

/*
 * CONSTITUTION 365
 * Constitutional Source Map
 *
 * Purpose:
 * - Load constitutional-sources.json once
 * - Retrieve the authoritative source entry for a day
 * - Provide a compact factual context to the prompt builder
 * - Prevent accidental use of the wrong day's references
 *
 * This file does NOT invent constitutional facts.
 * It only reads the source map already prepared for Constitution 365.
 */

const fs = require("fs");
const path = require("path");


/*
 * ------------------------------------------------------------
 * PATH
 * ------------------------------------------------------------
 */

const ROOT_DIR =
  path.resolve(__dirname, "..");

const DEFAULT_SOURCE_MAP_PATH =
  path.join(
    ROOT_DIR,
    "data",
    "constitutional-sources.json"
  );


/*
 * ------------------------------------------------------------
 * LOAD JSON
 * ------------------------------------------------------------
 */

function loadSourceMap(
  filePath = DEFAULT_SOURCE_MAP_PATH
) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Constitutional source map not found: ${filePath}`
    );
  }

  const raw =
    fs.readFileSync(
      filePath,
      "utf8"
    );

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Invalid constitutional-sources.json: ${error.message}`
    );
  }
}


/*
 * ------------------------------------------------------------
 * GET DAY SOURCE
 * ------------------------------------------------------------
 */

function getDaySource(
  sourceMap,
  day
) {
  if (
    !sourceMap ||
    typeof sourceMap !== "object"
  ) {
    throw new Error(
      "Source map must be an object."
    );
  }

  const dayNumber =
    Number(day);

  if (
    !Number.isInteger(dayNumber) ||
    dayNumber < 1 ||
    dayNumber > 365
  ) {
    throw new Error(
      `Invalid Constitution 365 day: ${day}`
    );
  }

  if (
    !sourceMap.days ||
    typeof sourceMap.days !== "object"
  ) {
    throw new Error(
      "constitutional-sources.json does not contain a valid days object."
    );
  }

  const source =
    sourceMap.days[String(dayNumber)] ||
    sourceMap.days[dayNumber];

  if (!source) {
    throw new Error(
      `No constitutional source mapping exists for day ${dayNumber}.`
    );
  }

  return source;
}


/*
 * ------------------------------------------------------------
 * NORMALIZE SOURCE ENTRY
 * ------------------------------------------------------------
 *
 * The prompt should receive only the factual source information
 * relevant to this lesson.
 *
 * Nothing is invented here.
 * Missing values remain empty arrays.
 */

function normalizeDaySource(
  source,
  day
) {
  if (
    !source ||
    typeof source !== "object"
  ) {
    throw new Error(
      `Invalid source entry for day ${day}.`
    );
  }

  return {
    day: Number(day),

    parts:
      Array.isArray(source.parts)
        ? source.parts
        : [],

    articles:
      Array.isArray(source.articles)
        ? source.articles
        : [],

    references:
      Array.isArray(source.references)
        ? source.references
        : [],

    ...(source.note
      ? {
          note: source.note
        }
      : {})
  };
}


/*
 * ------------------------------------------------------------
 * GET NORMALIZED DAY SOURCE
 * ------------------------------------------------------------
 */

function getNormalizedDaySource(
  sourceMap,
  day
) {
  const source =
    getDaySource(
      sourceMap,
      day
    );

  return normalizeDaySource(
    source,
    day
  );
}


/*
 * ------------------------------------------------------------
 * VALIDATE SOURCE MAP
 * ------------------------------------------------------------
 *
 * This is intentionally strict.
 *
 * Every day from 1–365 must have a mapping.
 * This prevents a generation job from silently creating a
 * lesson without its constitutional factual guardrail.
 */

function validateSourceMap(
  sourceMap
) {
  const errors = [];

  if (
    !sourceMap ||
    typeof sourceMap !== "object"
  ) {
    errors.push(
      "Source map is not an object."
    );

    return {
      valid: false,
      errors
    };
  }

  if (
    !sourceMap.course
  ) {
    errors.push(
      "Source map is missing course."
    );
  }

  if (
    !sourceMap.language
  ) {
    errors.push(
      "Source map is missing language."
    );
  }

  if (
    !sourceMap.country
  ) {
    errors.push(
      "Source map is missing country."
    );
  }

  if (
    !sourceMap.source ||
    typeof sourceMap.source !== "object"
  ) {
    errors.push(
      "Source map is missing source metadata."
    );
  }

  if (
    !sourceMap.days ||
    typeof sourceMap.days !== "object"
  ) {
    errors.push(
      "Source map is missing days."
    );

    return {
      valid: false,
      errors
    };
  }

  for (
    let day = 1;
    day <= 365;
    day++
  ) {
    const entry =
      sourceMap.days[String(day)] ||
      sourceMap.days[day];

    if (
      !entry ||
      typeof entry !== "object"
    ) {
      errors.push(
        `Missing constitutional source mapping for day ${day}.`
      );

      continue;
    }

    if (
      !Array.isArray(entry.parts)
    ) {
      errors.push(
        `Day ${day}: parts must be an array.`
      );
    }

    if (
      !Array.isArray(entry.articles)
    ) {
      errors.push(
        `Day ${day}: articles must be an array.`
      );
    }

    if (
      !Array.isArray(entry.references)
    ) {
      errors.push(
        `Day ${day}: references must be an array.`
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
 * CLI
 * ------------------------------------------------------------
 *
 * Usage:
 *
 * node scripts/source-map.js
 *
 * Validate:
 *
 * node scripts/source-map.js --validate
 *
 * Show a day:
 *
 * node scripts/source-map.js 1
 * ------------------------------------------------------------
 */

function runCli() {
  const args =
    process.argv.slice(2);

  const sourceMap =
    loadSourceMap();

  if (
    args.includes("--validate")
  ) {
    const result =
      validateSourceMap(
        sourceMap
      );

    console.log(
      "\n=========================================="
    );

    console.log(
      "CONSTITUTIONAL SOURCE MAP CHECK"
    );

    console.log(
      "=========================================="
    );

    console.log(
      `STATUS: ${
        result.valid
          ? "PASS"
          : "FAIL"
      }`
    );

    if (
      result.errors.length
    ) {
      console.log(
        "\nERRORS:"
      );

      for (
        const error of result.errors
      ) {
        console.log(
          `  ✗ ${error}`
        );
      }
    }

    console.log("");

    if (!result.valid) {
      process.exit(1);
    }

    return;
  }

  const dayArgument =
    args.find(
      value =>
        /^\d+$/.test(value)
    );

  if (!dayArgument) {
    console.log(
      "Usage:"
    );

    console.log(
      "  node scripts/source-map.js --validate"
    );

    console.log(
      "  node scripts/source-map.js 1"
    );

    return;
  }

  const day =
    Number(dayArgument);

  const source =
    getNormalizedDaySource(
      sourceMap,
      day
    );

  console.log(
    JSON.stringify(
      source,
      null,
      2
    )
  );
}


/*
 * ------------------------------------------------------------
 * EXPORTS
 * ------------------------------------------------------------
 */

module.exports = {
  loadSourceMap,
  getDaySource,
  getNormalizedDaySource,
  normalizeDaySource,
  validateSourceMap
};


/*
 * ------------------------------------------------------------
 * RUN CLI
 * ------------------------------------------------------------
 */

if (
  require.main === module
) {
  try {
    runCli();
  } catch (error) {
    console.error(
      `\nSOURCE MAP ERROR: ${error.message}`
    );

    process.exit(1);
  }
}
