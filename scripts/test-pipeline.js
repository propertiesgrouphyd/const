"use strict";

/*
 * CONSTITUTION 365
 * Local Pipeline Integration Test
 *
 * IMPORTANT:
 * This test NEVER calls Groq.
 *
 * It verifies that the local Constitution 365 generation
 * pipeline is internally consistent before real API generation.
 *
 * Usage:
 *
 *   node scripts/test-pipeline.js
 *
 * Expected result:
 *
 *   ALL TESTS PASSED
 *
 * This file is intentionally deterministic.
 */

const fs = require("fs");
const path = require("path");


/*
 * ------------------------------------------------------------
 * PATHS
 * ------------------------------------------------------------
 */

const ROOT_DIR =
  path.resolve(__dirname, "..");

const DATA_DIR =
  path.join(
    ROOT_DIR,
    "data"
  );

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
 * IMPORT PROJECT MODULES
 * ------------------------------------------------------------
 */

const {
  buildPrompt
} = require("./prompt-builder");

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

const {
  getDayFilePath,
  validateSyllabus
} = require("./generate-day");


/*
 * ------------------------------------------------------------
 * TEST STATE
 * ------------------------------------------------------------
 */

let passed = 0;
let failed = 0;


function pass(message) {
  passed++;

  console.log(
    `  ✓ ${message}`
  );
}


function fail(message) {
  failed++;

  console.error(
    `  ✗ ${message}`
  );
}


function section(title) {
  console.log(
    `\n------------------------------------------`
  );

  console.log(
    title
  );

  console.log(
    `------------------------------------------`
  );
}


/*
 * ------------------------------------------------------------
 * JSON LOADER
 * ------------------------------------------------------------
 */

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `File not found: ${filePath}`
    );
  }

  const content =
    fs.readFileSync(
      filePath,
      "utf8"
    );

  return JSON.parse(
    content
  );
}


/*
 * ------------------------------------------------------------
 * TEST 1 — REQUIRED FILES
 * ------------------------------------------------------------
 */

function testRequiredFiles() {
  section(
    "TEST 1 — REQUIRED FILES"
  );

  const files = [
    "package.json",
    "data/syllabus.json",
    "data/constitutional-sources.json",
    "scripts/generate-day.js",
    "scripts/prompt-builder.js",
    "scripts/groq.js",
    "scripts/validate-day.js",
    "scripts/quality-check.js",
    "scripts/source-map.js"
  ];

  for (
    const relativePath of files
  ) {
    const absolutePath =
      path.join(
        ROOT_DIR,
        relativePath
      );

    if (
      fs.existsSync(
        absolutePath
      )
    ) {
      pass(
        relativePath
      );
    } else {
      fail(
        `Missing: ${relativePath}`
      );
    }
  }
}


/*
 * ------------------------------------------------------------
 * TEST 2 — MODULE LOADING
 * ------------------------------------------------------------
 */

function testModules() {
  section(
    "TEST 2 — MODULE LOADING"
  );

  const modules = [
    [
      "prompt-builder.js",
      "./prompt-builder"
    ],
    [
      "groq.js",
      "./groq"
    ],
    [
      "validate-day.js",
      "./validate-day"
    ],
    [
      "quality-check.js",
      "./quality-check"
    ],
    [
      "source-map.js",
      "./source-map"
    ],
    [
      "generate-day.js",
      "./generate-day"
    ]
  ];

  for (
    const [name, modulePath] of modules
  ) {
    try {
      require(modulePath);

      pass(
        `${name} loads successfully`
      );
    } catch (error) {
      fail(
        `${name} failed to load: ${error.message}`
      );
    }
  }
}


/*
 * ------------------------------------------------------------
 * TEST 3 — SYLLABUS
 * ------------------------------------------------------------
 */

function testSyllabus() {
  section(
    "TEST 3 — 365-DAY SYLLABUS"
  );

  let syllabus;

  try {
    syllabus =
      loadJson(
        SYLLABUS_PATH
      );
  } catch (error) {
    fail(
      `Could not load syllabus.json: ${error.message}`
    );

    return null;
  }

  const result =
    validateSyllabus(
      syllabus
    );

  if (
    result.valid
  ) {
    pass(
      "Syllabus contains exactly 365 valid days"
    );
  } else {
    for (
      const error of result.errors
    ) {
      fail(
        error
      );
    }
  }

  return syllabus;
}


/*
 * ------------------------------------------------------------
 * TEST 4 — SOURCE MAP
 * ------------------------------------------------------------
 */

function testSourceMap() {
  section(
    "TEST 4 — CONSTITUTIONAL SOURCE MAP"
  );

  let sourceMap;

  try {
    sourceMap =
      loadSourceMap();
  } catch (error) {
    fail(
      error.message
    );

    return null;
  }

  const result =
    validateSourceMap(
      sourceMap
    );

  if (
    result.valid
  ) {
    pass(
      "Constitutional source map contains valid mappings for Days 1-365"
    );
  } else {
    for (
      const error of result.errors
    ) {
      fail(
        error
      );
    }
  }

  return sourceMap;
}


/*
 * ------------------------------------------------------------
 * TEST 5 — DAY-BY-DAY SOURCE COVERAGE
 * ------------------------------------------------------------
 */

function testSourceCoverage(
  sourceMap
) {
  section(
    "TEST 5 — DAY-BY-DAY SOURCE COVERAGE"
  );

  if (!sourceMap) {
    fail(
      "Source map unavailable."
    );

    return;
  }

  let validDays = 0;

  for (
    let day = 1;
    day <= 365;
    day++
  ) {
    try {
      const source =
        getNormalizedDaySource(
          sourceMap,
          day
        );

      if (
        source &&
        (
          source.parts.length ||
          source.articles.length ||
          source.references.length
        )
      ) {
        validDays++;
      } else {
        fail(
          `Day ${day} has no usable constitutional source information.`
        );
      }
    } catch (error) {
      fail(
        `Day ${day}: ${error.message}`
      );
    }
  }

  if (
    validDays === 365
  ) {
    pass(
      "All 365 days have usable constitutional source information"
    );
  }
}


/*
 * ------------------------------------------------------------
 * TEST 6 — SYLLABUS / SOURCE ALIGNMENT
 * ------------------------------------------------------------
 */

function testSyllabusSourceAlignment(
  syllabus,
  sourceMap
) {
  section(
    "TEST 6 — SYLLABUS / SOURCE ALIGNMENT"
  );

  if (
    !syllabus ||
    !sourceMap
  ) {
    fail(
      "Syllabus or source map unavailable."
    );

    return;
  }

  const entries =
    Array.isArray(syllabus)
      ? syllabus
      : syllabus.days;

  let aligned = 0;

  for (
    const entry of entries
  ) {
    const day =
      Number(entry.day);

    try {
      const source =
        getNormalizedDaySource(
          sourceMap,
          day
        );

      if (
        source.day === day
      ) {
        aligned++;
      } else {
        fail(
          `Day ${day} source alignment mismatch.`
        );
      }
    } catch (error) {
      fail(
        `Day ${day}: ${error.message}`
      );
    }
  }

  if (
    aligned === 365
  ) {
    pass(
      "All 365 syllabus days align with their source-map day"
    );
  }
}


/*
 * ------------------------------------------------------------
 * TEST 7 — PROMPT BUILDER
 * ------------------------------------------------------------
 */

function testPromptBuilder(
  syllabus
) {
  section(
    "TEST 7 — PROMPT BUILDER"
  );

  if (!syllabus) {
    fail(
      "Syllabus unavailable."
    );

    return;
  }

  const entries =
    Array.isArray(syllabus)
      ? syllabus
      : syllabus.days;

  const testDays = [
    1,
    18,
    61,
    136,
    151,
    231,
    301,
    365
  ];

  for (
    const day of testDays
  ) {
    const entry =
      entries.find(
        item =>
          Number(item.day) === day
      );

    if (!entry) {
      fail(
        `Prompt test day ${day} missing from syllabus.`
      );

      continue;
    }

    /*
     * Use a minimal source context here because this test
     * is checking the prompt builder itself.
     */

    const sourceDay = {
      parts: [
        "Test Part"
      ],
      articles: [
        "Test Article"
      ],
      references: [
        "Test constitutional reference"
      ]
    };

    try {
      const prompt =
        buildPrompt({
          syllabus: entry,
          sourceMap: sourceDay
        });

      if (
        typeof prompt !== "string" ||
        prompt.length < 1000
      ) {
        fail(
          `Day ${day}: generated prompt is unexpectedly short.`
        );

        continue;
      }

      const requiredTerms = [
        "Telugu",
        "constitutional",
        "JSON",
        "opening",
        "explanation",
        "real_life_example",
        "takeaway"
      ];

      const missing =
        requiredTerms.filter(
          term =>
            !prompt
              .toLowerCase()
              .includes(
                term.toLowerCase()
              )
        );

      if (
        missing.length
      ) {
        fail(
          `Day ${day}: prompt missing expected instructions: ${missing.join(", ")}`
        );

        continue;
      }

      pass(
        `Day ${day} prompt generated correctly`
      );

    } catch (error) {
      fail(
        `Day ${day}: prompt builder error: ${error.message}`
      );
    }
  }
}


/*
 * ------------------------------------------------------------
 * TEST 8 — SAMPLE LESSON
 * ------------------------------------------------------------
 *
 * This is deliberately constructed locally.
 *
 * It is NOT presented as constitutional teaching content.
 * Its purpose is only to test the validator interfaces.
 * ------------------------------------------------------------
 */

function createSampleLesson(
  syllabusEntry,
  sourceDay
) {
  return {
    day:
      Number(syllabusEntry.day),

    title:
      syllabusEntry.title,

    stage:
      syllabusEntry.stage,

    lesson: {
      opening:
        "మన రోజువారీ జీవితంలో మనకు కనిపించే అనేక హక్కులు, బాధ్యతలు మరియు ప్రభుత్వ వ్యవస్థల వెనుక ఒక పెద్ద ఆలోచన ఉంటుంది. ఆ ఆలోచనను అర్థం చేసుకోవడం ద్వారా రాజ్యాంగం పుస్తకంలో ఉన్న పదాలు మాత్రమే కాదని మనకు స్పష్టమవుతుంది.",

      explanation:
        "ఇది స్థానిక పరీక్ష కోసం తయారు చేసిన నమూనా వివరణ మాత్రమే. రాజ్యాంగంలోని ఒక అంశాన్ని ప్రజల జీవితానికి దగ్గరగా ఎలా వివరించాలో పరీక్షించడానికి ఈ వాక్యాలు ఉపయోగించబడుతున్నాయి. అసలు పాఠంలో సంబంధిత రాజ్యాంగ నిబంధనను ఖచ్చితంగా ఆధారంగా తీసుకుని, దాని అర్థాన్ని సాధారణ భాషలో వివరించాలి.",

      why_it_matters:
        "రాజ్యాంగ విషయం ప్రజల జీవితంతో ఎలా సంబంధం కలిగి ఉందో స్పష్టంగా తెలుసుకోవడం వల్ల హక్కులు, బాధ్యతలు మరియు ప్రజాస్వామ్య వ్యవస్థను మరింత బాధ్యతగా అర్థం చేసుకోవచ్చు.",

      how_it_works:
        "ఈ నమూనా భాగం కేవలం పరీక్ష కోసం మాత్రమే. అసలు పాఠంలో సంబంధిత నిబంధన ఏమి చెబుతుంది, అది ఎవరికి వర్తిస్తుంది, దాని పరిమితులు ఏమిటి అనే విషయాలను మూలాధారానికి అనుగుణంగా వివరించాలి.",

      real_life_example:
        "ఒక గ్రామంలో ప్రజలు ఒక ప్రభుత్వ సేవను ఉపయోగిస్తున్నారని ఊహించండి. వారికి ఆ సేవ ఎలా అందాలి, ఎవరి బాధ్యత ఏమిటి అనే విషయం అర్థం కావడానికి రాజ్యాంగ వ్యవస్థ గురించి స్పష్టమైన అవగాహన ఉపయోగపడుతుంది. ఇది కేవలం స్థానిక పరీక్ష కోసం రూపొందించిన సాధారణ ఉదాహరణ.",

      simple_comparison:
        "ఇది ఒక పెద్ద ఇంటికి ఉన్న నియమాల పుస్తకంలా ఊహించవచ్చు. ఇంట్లో ప్రతి వ్యక్తి ఎలా కలిసి ఉండాలో కొన్ని ప్రాథమిక నియమాలు అవసరమైనట్లే, దేశ పరిపాలనకు కూడా ప్రాథమిక నియమాలు అవసరం.",

      common_misunderstanding:
        "రాజ్యాంగంలోని ప్రతి విషయం ప్రతి పరిస్థితిలో ఒకే విధంగా పనిచేస్తుందని అనుకోవడం సరైనది కాదు. ఒక నిబంధనకు దాని స్వంత పరిధి, అర్థం మరియు పరిమితులు ఉండవచ్చు. కాబట్టి సాధారణ అపోహను తొలగించడానికి మూల నిబంధనను చూడాలి.",

      what_it_means_for_me:
        "పౌరుడిగా మీకు రాజ్యాంగం కేవలం ప్రభుత్వానికి సంబంధించిన పుస్తకం కాదు. మీ హక్కులు, మీ బాధ్యతలు మరియు ప్రజాస్వామ్యంలో మీ పాత్రను అర్థం చేసుకోవడానికి అది ఒక ప్రాథమిక ఆధారం.",

      takeaway:
        "రాజ్యాంగాన్ని అర్థం చేసుకోవడం అంటే కేవలం పదాలను గుర్తుపెట్టుకోవడం కాదు; అవి మన జీవితంలో ఎందుకు ఉన్నాయో తెలుసుకోవడం."
    },

    constitutional_reference: {
      parts:
        sourceDay.parts,

      articles:
        sourceDay.articles,

      references:
        sourceDay.references
    },

    reflection: {
      question:
        "ఈ రాజ్యాంగ ఆలోచన మీ రోజువారీ జీవితంలో ఎక్కడ కనిపించవచ్చు?"
    }
  };
}


/*
 * ------------------------------------------------------------
 * TEST 9 — VALIDATOR INTEGRATION
 * ------------------------------------------------------------
 */

function testValidatorIntegration(
  syllabus,
  sourceMap
) {
  section(
    "TEST 9 — VALIDATOR INTEGRATION"
  );

  if (
    !syllabus ||
    !sourceMap
  ) {
    fail(
      "Required test data unavailable."
    );

    return;
  }

  const entries =
    Array.isArray(syllabus)
      ? syllabus
      : syllabus.days;

  const testDays = [
    1,
    61,
    151,
    231,
    301,
    365
  ];

  for (
    const day of testDays
  ) {
    const entry =
      entries.find(
        item =>
          Number(item.day) === day
      );

    if (!entry) {
      fail(
        `Test day ${day} missing.`
      );

      continue;
    }

    let sourceDay;

    try {
      sourceDay =
        getNormalizedDaySource(
          sourceMap,
          day
        );
    } catch (error) {
      fail(
        `Day ${day}: source retrieval failed: ${error.message}`
      );

      continue;
    }

    const sample =
      createSampleLesson(
        entry,
        sourceDay
      );

    try {
      const validation =
        validateDay({
          generated: sample,
          syllabus: entry,
          sourceMap: sourceDay
        });

      /*
       * The sample should be structurally valid.
       */

      if (
        validation.valid
      ) {
        pass(
          `Day ${day}: structural validator integration works`
        );
      } else {
        fail(
          `Day ${day}: structural validator rejected the integration sample.`
        );

        for (
          const error of validation.errors
        ) {
          console.error(
            `      ${error}`
          );
        }
      }

    } catch (error) {
      fail(
        `Day ${day}: validateDay() threw an error: ${error.message}`
      );
    }


    try {
      const quality =
        checkQuality({
          generated: sample,
          syllabus: entry
        });

      /*
       * Quality may legitimately reject the synthetic sample.
       *
       * We therefore test that the function executes and
       * returns the expected contract rather than demanding
       * that artificial content passes the editorial gate.
       */

      if (
        typeof quality.valid === "boolean" &&
        typeof quality.score === "number" &&
        Array.isArray(quality.errors) &&
        Array.isArray(quality.warnings)
      ) {
        pass(
          `Day ${day}: quality checker integration works`
        );
      } else {
        fail(
          `Day ${day}: quality checker returned an invalid result shape.`
        );
      }

    } catch (error) {
      fail(
        `Day ${day}: checkQuality() threw an error: ${error.message}`
      );
    }
  }
}


/*
 * ------------------------------------------------------------
 * TEST 10 — OUTPUT FILE NAMING
 * ------------------------------------------------------------
 */

function testOutputPaths() {
  section(
    "TEST 10 — OUTPUT FILE NAMING"
  );

  const expected = [
    [1, "day-001.json"],
    [2, "day-002.json"],
    [9, "day-009.json"],
    [10, "day-010.json"],
    [99, "day-099.json"],
    [100, "day-100.json"],
    [365, "day-365.json"]
  ];

  for (
    const [day, filename] of expected
  ) {
    const result =
      getDayFilePath(
        day
      );

    const expectedPath =
      path.join(
        DATA_DIR,
        filename
      );

    if (
      result === expectedPath
    ) {
      pass(
        `Day ${day} → ${filename}`
      );
    } else {
      fail(
        `Day ${day}: expected ${expectedPath}, got ${result}`
      );
    }
  }
}


/*
 * ------------------------------------------------------------
 * TEST 11 — DAY RANGE PROTECTION
 * ------------------------------------------------------------
 */

function testDayRangeProtection() {
  section(
    "TEST 11 — DAY RANGE PROTECTION"
  );

  /*
   * source-map.js should reject invalid days.
   */

  const sourceMap =
    loadSourceMap();

  const invalidDays = [
    0,
    -1,
    366,
    1000,
    "abc",
    null
  ];

  for (
    const day of invalidDays
  ) {
    let rejected = false;

    try {
      getNormalizedDaySource(
        sourceMap,
        day
      );
    } catch {
      rejected = true;
    }

    if (rejected) {
      pass(
        `Invalid day rejected: ${String(day)}`
      );
    } else {
      fail(
        `Invalid day was not rejected: ${String(day)}`
      );
    }
  }
}


/*
 * ------------------------------------------------------------
 * TEST 12 — NO GROQ REQUEST
 * ------------------------------------------------------------
 */

function testNoGroqRequirement() {
  section(
    "TEST 12 — SAFE LOCAL TEST"
  );

  /*
   * This script intentionally does not require GROQ_API_KEY.
   *
   * That is a feature, not an error.
   */

  if (
    !process.env.GROQ_API_KEY
  ) {
    pass(
      "No GROQ_API_KEY required — local test is API-free"
    );

    return;
  }

  pass(
    "GROQ_API_KEY is present, but this test still makes no API request"
  );
}


/*
 * ------------------------------------------------------------
 * MAIN
 * ------------------------------------------------------------
 */

function main() {
  console.log(
    "\n=========================================="
  );

  console.log(
    "CONSTITUTION 365 — LOCAL PIPELINE TEST"
  );

  console.log(
    "=========================================="
  );

  console.log(
    "This test does NOT call Groq."
  );

  console.log(
    "No API credits are consumed."
  );

  testRequiredFiles();

  testModules();

  const syllabus =
    testSyllabus();

  const sourceMap =
    testSourceMap();

  testSourceCoverage(
    sourceMap
  );

  testSyllabusSourceAlignment(
    syllabus,
    sourceMap
  );

  testPromptBuilder(
    syllabus
  );

  testValidatorIntegration(
    syllabus,
    sourceMap
  );

  testOutputPaths();

  testDayRangeProtection();

  testNoGroqRequirement();


  /*
   * --------------------------------------------------------
   * FINAL RESULT
   * --------------------------------------------------------
   */

  console.log(
    "\n=========================================="
  );

  console.log(
    "FINAL TEST RESULT"
  );

  console.log(
    "=========================================="
  );

  console.log(
    `PASSED: ${passed}`
  );

  console.log(
    `FAILED: ${failed}`
  );

  console.log("");

  if (
    failed === 0
  ) {
    console.log(
      "ALL TESTS PASSED"
    );

    console.log(
      "The local Constitution 365 pipeline is structurally ready."
    );

    process.exit(0);
  }

  console.error(
    "PIPELINE TEST FAILED"
  );

  console.error(
    "Fix the failures above before enabling automated generation."
  );

  process.exit(1);
}


/*
 * ------------------------------------------------------------
 * RUN
 * ------------------------------------------------------------
 */

try {
  main();
} catch (error) {
  console.error(
    `\nTEST RUNNER ERROR: ${error.message}`
  );

  process.exit(1);
}
