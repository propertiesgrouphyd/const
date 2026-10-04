"use strict";

/*
 * CONSTITUTION 365
 * Daily Lesson Structural Validator
 *
 * This validator answers:
 *
 * "Is this generated object structurally valid and consistent
 * with the syllabus/source map?"
 *
 * It does NOT decide whether the writing is excellent.
 * That is handled separately by quality-check.js.
 */

const fs = require("fs");
const path = require("path");

const LESSON_FIELDS = [
  "opening",
  "explanation",
  "why_it_matters",
  "how_it_works",
  "real_life_example",
  "simple_comparison",
  "common_misunderstanding",
  "what_it_means_for_me",
  "takeaway"
];

const REQUIRED_TOP_LEVEL_FIELDS = [
  "day",
  "title",
  "stage",
  "lesson",
  "constitutional_reference",
  "reflection"
];

const ALLOWED_TOP_LEVEL_FIELDS = new Set(
  REQUIRED_TOP_LEVEL_FIELDS
);

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isNonEmptyString(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function hasTelugu(text) {
  if (typeof text !== "string") {
    return false;
  }

  return /[\u0C00-\u0C7F]/u.test(text);
}

function textLength(text) {
  if (typeof text !== "string") {
    return 0;
  }

  return text.trim().length;
}

function addError(errors, message) {
  errors.push(message);
}

function addWarning(warnings, message) {
  warnings.push(message);
}

function validateDay({
  generated,
  syllabus,
  sourceMap,
  expectedDay
}) {
  const errors = [];
  const warnings = [];

  /*
   * ------------------------------------------------------------
   * 1. BASIC OBJECT CHECK
   * ------------------------------------------------------------
   */

  if (!isPlainObject(generated)) {
    addError(
      errors,
      "Generated lesson must be a JSON object."
    );

    return {
      valid: false,
      errors,
      warnings
    };
  }

  if (!isPlainObject(syllabus)) {
    addError(
      errors,
      "Syllabus entry is missing or invalid."
    );
  }

  if (!isPlainObject(sourceMap)) {
    addError(
      errors,
      "Constitutional source map is missing or invalid."
    );
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings
    };
  }

  /*
   * ------------------------------------------------------------
   * 2. EXPECTED DAY
   * ------------------------------------------------------------
   */

  const day = Number(expectedDay);

  if (!Number.isInteger(day) || day < 1 || day > 365) {
    addError(
      errors,
      `Invalid expected day: ${expectedDay}`
    );
  }

  if (generated.day !== day) {
    addError(
      errors,
      `Generated day is ${generated.day}, expected ${day}.`
    );
  }

  if (syllabus.day !== day) {
    addError(
      errors,
      `Syllabus day is ${syllabus.day}, expected ${day}.`
    );
  }

  /*
   * ------------------------------------------------------------
   * 3. TOP-LEVEL STRUCTURE
   * ------------------------------------------------------------
   */

  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    if (!(field in generated)) {
      addError(
        errors,
        `Missing required top-level field: ${field}`
      );
    }
  }

  for (const field of Object.keys(generated)) {
    if (!ALLOWED_TOP_LEVEL_FIELDS.has(field)) {
      addError(
        errors,
        `Unexpected top-level field: ${field}`
      );
    }
  }

  /*
   * ------------------------------------------------------------
   * 4. TITLE
   * ------------------------------------------------------------
   */

  if (!isNonEmptyString(generated.title)) {
    addError(
      errors,
      "Title must be a non-empty string."
    );
  } else if (generated.title !== syllabus.title) {
    addError(
      errors,
      `Title does not exactly match syllabus. Expected: "${syllabus.title}"`
    );
  }

  /*
   * ------------------------------------------------------------
   * 5. STAGE
   * ------------------------------------------------------------
   */

  if (!isNonEmptyString(generated.stage)) {
    addError(
      errors,
      "Stage must be a non-empty string."
    );
  } else if (generated.stage !== syllabus.stage) {
    addError(
      errors,
      `Stage does not exactly match syllabus. Expected: "${syllabus.stage}"`
    );
  }

  /*
   * ------------------------------------------------------------
   * 6. LESSON OBJECT
   * ------------------------------------------------------------
   */

  if (!isPlainObject(generated.lesson)) {
    addError(
      errors,
      "lesson must be an object."
    );
  } else {
    for (const field of LESSON_FIELDS) {
      if (!(field in generated.lesson)) {
        addError(
          errors,
          `Missing lesson field: lesson.${field}`
        );
        continue;
      }

      const value = generated.lesson[field];

      if (!isNonEmptyString(value)) {
        addError(
          errors,
          `Lesson field is empty: lesson.${field}`
        );
        continue;
      }

      if (!hasTelugu(value)) {
        addError(
          errors,
          `Lesson field contains no Telugu text: lesson.${field}`
        );
      }

      /*
       * Prevent accidental model output such as:
       *
       * ```json
       * {...}
       * ```
       */

      if (
        value.includes("```") ||
        value.includes("```json")
      ) {
        addError(
          errors,
          `Markdown code fence found inside lesson.${field}`
        );
      }
    }

    /*
     * Basic length sanity checks.
     *
     * These are intentionally not strict quality thresholds.
     * quality-check.js handles deeper editorial quality.
     */

    for (const field of LESSON_FIELDS) {
      const value = generated.lesson[field];

      if (
        typeof value === "string" &&
        value.trim().length < 20
      ) {
        addWarning(
          warnings,
          `Lesson field is unusually short: lesson.${field}`
        );
      }
    }

    /*
     * Detect exact duplicate sections.
     *
     * Some overlap is normal, but two sections being exactly
     * identical is almost always a generation problem.
     */

    for (let i = 0; i < LESSON_FIELDS.length; i++) {
      for (let j = i + 1; j < LESSON_FIELDS.length; j++) {
        const first = generated.lesson[LESSON_FIELDS[i]];
        const second = generated.lesson[LESSON_FIELDS[j]];

        if (
          typeof first === "string" &&
          typeof second === "string" &&
          first.trim() === second.trim()
        ) {
          addError(
            errors,
            `Duplicate lesson sections: lesson.${LESSON_FIELDS[i]} and lesson.${LESSON_FIELDS[j]}`
          );
        }
      }
    }
  }

  /*
   * ------------------------------------------------------------
   * 7. CONSTITUTIONAL REFERENCE
   * ------------------------------------------------------------
   */

  if (
    !isPlainObject(
      generated.constitutional_reference
    )
  ) {
    addError(
      errors,
      "constitutional_reference must be an object."
    );
  } else {
    const reference =
      generated.constitutional_reference;

    if (!Array.isArray(reference.parts)) {
      addError(
        errors,
        "constitutional_reference.parts must be an array."
      );
    }

    if (!Array.isArray(reference.articles)) {
      addError(
        errors,
        "constitutional_reference.articles must be an array."
      );
    }

    if (!Array.isArray(reference.references)) {
      addError(
        errors,
        "constitutional_reference.references must be an array."
      );
    }

    /*
     * Compare against our source map.
     *
     * The model is not allowed to silently change the
     * constitutional reference supplied to it.
     */

    const source =
      sourceMap.days &&
      sourceMap.days[String(day)]
        ? sourceMap.days[String(day)]
        : null;

    if (!source) {
      addWarning(
        warnings,
        `No source-map entry found for day ${day}.`
      );
    } else {
      const expectedArticles =
        Array.isArray(source.articles)
          ? source.articles.map(String)
          : [];

      const expectedParts =
        Array.isArray(source.parts)
          ? source.parts.map(String)
          : [];

      const expectedReferences =
        Array.isArray(source.references)
          ? source.references.map(String)
          : [];

      const actualArticles =
        Array.isArray(reference.articles)
          ? reference.articles.map(String)
          : [];

      const actualParts =
        Array.isArray(reference.parts)
          ? reference.parts.map(String)
          : [];

      const actualReferences =
        Array.isArray(reference.references)
          ? reference.references.map(String)
          : [];

      /*
       * The generated lesson may not invent an Article.
       */

      for (const article of actualArticles) {
        if (!expectedArticles.includes(article)) {
          addError(
            errors,
            `Generated constitutional Article "${article}" is not present in the source map for day ${day}.`
          );
        }
      }

      /*
       * If the source map explicitly has Articles, require the
       * generated output to preserve them.
       */

      if (expectedArticles.length > 0) {
        for (const article of expectedArticles) {
          if (!actualArticles.includes(article)) {
            addError(
              errors,
              `Required constitutional Article "${article}" is missing from generated reference.`
            );
          }
        }
      }

      /*
       * Parts should also be preserved.
       */

      for (const part of expectedParts) {
        if (!actualParts.includes(part)) {
          addError(
            errors,
            `Required constitutional Part "${part}" is missing from generated reference.`
          );
        }
      }

      /*
       * References are checked conservatively.
       *
       * Do not require exact wording for every reference because
       * Groq may naturally shorten a reference description.
       */

      if (
        expectedReferences.length > 0 &&
        actualReferences.length === 0
      ) {
        addError(
          errors,
          "Constitutional references are missing."
        );
      }
    }
  }

  /*
   * ------------------------------------------------------------
   * 8. REFLECTION
   * ------------------------------------------------------------
   */

  if (!isPlainObject(generated.reflection)) {
    addError(
      errors,
      "reflection must be an object."
    );
  } else {
    if (
      !isNonEmptyString(
        generated.reflection.question
      )
    ) {
      addError(
        errors,
        "reflection.question must be a non-empty string."
      );
    } else if (
      !hasTelugu(
        generated.reflection.question
      )
    ) {
      addError(
        errors,
        "reflection.question must contain Telugu."
      );
    }
  }

  /*
   * ------------------------------------------------------------
   * 9. OBVIOUS BAD MODEL OUTPUT
   * ------------------------------------------------------------
   */

  const serialized =
    JSON.stringify(generated);

  const forbiddenPatterns = [
    "As an AI",
    "As an artificial intelligence",
    "I cannot",
    "I can't",
    "Here is the JSON",
    "Sure,",
    "Certainly!"
  ];

  for (const pattern of forbiddenPatterns) {
    if (
      serialized
        .toLowerCase()
        .includes(pattern.toLowerCase())
    ) {
      addError(
        errors,
        `Unexpected model/meta text detected: "${pattern}"`
      );
    }
  }

  /*
   * ------------------------------------------------------------
   * 10. SYLLABUS FOCUS SANITY
   * ------------------------------------------------------------
   */

  if (
    !isNonEmptyString(
      syllabus.focus
    )
  ) {
    addWarning(
      warnings,
      "Syllabus focus is empty."
    );
  }

  /*
   * ------------------------------------------------------------
   * 11. OVERALL TEXT SANITY
   * ------------------------------------------------------------
   */

  if (isPlainObject(generated.lesson)) {
    const totalCharacters =
      LESSON_FIELDS.reduce(
        (total, field) =>
          total +
          textLength(
            generated.lesson[field]
          ),
        0
      );

    if (totalCharacters < 500) {
      addWarning(
        warnings,
        `Entire lesson is unusually short (${totalCharacters} characters).`
      );
    }

    if (totalCharacters > 30000) {
      addWarning(
        warnings,
        `Entire lesson is unusually long (${totalCharacters} characters).`
      );
    }
  }

  /*
   * ------------------------------------------------------------
   * FINAL RESULT
   * ------------------------------------------------------------
   */

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}


/*
 * ------------------------------------------------------------
 * OPTIONAL CLI MODE
 * ------------------------------------------------------------
 *
 * This allows:
 *
 * node scripts/validate-day.js data/day-001.json
 *
 * to validate a generated file manually.
 *
 * The main generation pipeline can import validateDay()
 * directly instead.
 * ------------------------------------------------------------
 */

function loadJson(filePath) {
  const absolutePath =
    path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `File not found: ${absolutePath}`
    );
  }

  const text =
    fs.readFileSync(
      absolutePath,
      "utf8"
    );

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${absolutePath}: ${error.message}`
    );
  }
}

async function runCli() {
  const generatedPath =
    process.argv[2];

  const dayArgument =
    process.argv[3];

  if (!generatedPath) {
    console.error(
      "Usage: node scripts/validate-day.js <generated-json> [day]"
    );

    process.exit(1);
  }

  const generated =
    loadJson(generatedPath);

  const day =
    dayArgument
      ? Number(dayArgument)
      : Number(generated.day);

  const syllabusPath =
    path.resolve(
      __dirname,
      "..",
      "data",
      "syllabus.json"
    );

  const sourceMapPath =
    path.resolve(
      __dirname,
      "..",
      "data",
      "constitutional-sources.json"
    );

  const syllabusFile =
    loadJson(syllabusPath);

  const sourceMap =
    loadJson(sourceMapPath);

  /*
   * Support either:
   *
   * 1. syllabus.json = array
   *
   * or
   *
   * 2. syllabus.json = { days: [...] }
   */

  let syllabus;

  if (Array.isArray(syllabusFile)) {
    syllabus =
      syllabusFile.find(
        item => Number(item.day) === day
      );
  } else if (
    isPlainObject(syllabusFile) &&
    Array.isArray(syllabusFile.days)
  ) {
    syllabus =
      syllabusFile.days.find(
        item => Number(item.day) === day
      );
  }

  if (!syllabus) {
    throw new Error(
      `Could not find day ${day} in syllabus.json`
    );
  }

  const result =
    validateDay({
      generated,
      syllabus,
      sourceMap,
      expectedDay: day
    });

  console.log(
    "\n=========================================="
  );

  console.log(
    `CONSTITUTION 365 VALIDATION — DAY ${day}`
  );

  console.log(
    "==========================================\n"
  );

  if (result.valid) {
    console.log("STATUS: PASS");
  } else {
    console.log("STATUS: FAIL");
  }

  if (result.errors.length > 0) {
    console.log("\nERRORS:");

    for (const error of result.errors) {
      console.log(`  ✗ ${error}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log("\nWARNINGS:");

    for (const warning of result.warnings) {
      console.log(`  ! ${warning}`);
    }
  }

  console.log("");

  if (!result.valid) {
    process.exit(1);
  }
}

if (require.main === module) {
  runCli().catch(error => {
    console.error(
      `\nVALIDATION ERROR: ${error.message}`
    );

    process.exit(1);
  });
}

module.exports = {
  validateDay,
  LESSON_FIELDS
};
