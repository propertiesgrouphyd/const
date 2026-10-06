const fs = require("fs");
const path = require("path");

const DAY = Number(process.env.DAY || 0);
const VALIDATE_ONLY =
  process.argv.includes("--validate");

const ROOT = process.cwd();
const DATA = path.join(ROOT, "data");

const FILES = {
  syllabus: "syllabus.json",
  sourceMap: "source-map.json",
  constitutional: "constitutional-sources.json",
  historical: "historical-sources.json",
  legal: "legal-sources.json",
  judicial: "judicial-sources.json",
  official: "official-sources.json"
};

const ALLOWED_CONSTITUTIONAL_TYPES =
  new Set([
    "constitutional",
    "conceptual",
    "historical",
    "statutory",
    "judicial",
    "mixed"
  ]);

const ALLOWED_SOURCE_LAYERS =
  new Set([
    "constitutional",
    "historical",
    "legal",
    "judicial",
    "official"
  ]);

const REQUIRED_TEXT_FIELDS = [
  "title",
  "stage",
  "focus",
  "lesson",
  "why_it_matters",
  "common_misunderstanding",
  "reflection"
];

const MAX_GENERATION_ATTEMPTS = 4;


/* ==========================================================================
   LOAD JSON
========================================================================== */

function loadJson(fileName) {
  const filePath =
    path.join(DATA, fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Required source file not found: data/${fileName}`
    );
  }

  try {
    return JSON.parse(
      fs.readFileSync(
        filePath,
        "utf8"
      )
    );
  } catch (error) {
    throw new Error(
      `Invalid JSON in data/${fileName}: ${error.message}`
    );
  }
}


/* ==========================================================================
   DAY VALIDATION
========================================================================== */

if (
  !Number.isInteger(DAY) ||
  DAY < 1 ||
  DAY > 365
) {
  throw new Error(
    "DAY must be an integer between 1 and 365"
  );
}


/* ==========================================================================
   LOAD AUTHORITATIVE SOURCE FILES
========================================================================== */

const SYLLABUS =
  loadJson(FILES.syllabus);

const SOURCE_MAP =
  loadJson(FILES.sourceMap);

const CONSTITUTIONAL =
  loadJson(FILES.constitutional);

const HISTORICAL =
  loadJson(FILES.historical);

const LEGAL =
  loadJson(FILES.legal);

const JUDICIAL =
  loadJson(FILES.judicial);

const OFFICIAL =
  loadJson(FILES.official);


/* ==========================================================================
   BASIC STRUCTURE VALIDATION
========================================================================== */

if (!Array.isArray(SYLLABUS)) {
  throw new Error(
    "syllabus.json must contain an array"
  );
}

if (SYLLABUS.length !== 365) {
  throw new Error(
    `syllabus.json must contain exactly 365 entries; found ${SYLLABUS.length}`
  );
}

if (
  !CONSTITUTIONAL ||
  typeof CONSTITUTIONAL !== "object" ||
  Array.isArray(CONSTITUTIONAL) ||
  !CONSTITUTIONAL.days ||
  typeof CONSTITUTIONAL.days !== "object" ||
  Array.isArray(CONSTITUTIONAL.days)
) {
  throw new Error(
    "constitutional-sources.json must contain a days object"
  );
}

if (
  !SOURCE_MAP ||
  typeof SOURCE_MAP !== "object" ||
  Array.isArray(SOURCE_MAP)
) {
  throw new Error(
    "source-map.json must contain an object"
  );
}


/* ==========================================================================
   FIND DAY
========================================================================== */

const syllabusEntry =
  SYLLABUS.find(
    item =>
      Number(item?.day) === DAY
  );

if (!syllabusEntry) {
  throw new Error(
    `Syllabus entry not found for day ${DAY}`
  );
}

const constitutionalEntry =
  CONSTITUTIONAL.days[String(DAY)];

if (!constitutionalEntry) {
  throw new Error(
    `Constitutional source not found for day ${DAY}`
  );
}


/* ==========================================================================
   HELPERS
========================================================================== */

function getDaySource(
  container,
  day
) {
  if (
    !container ||
    typeof container !== "object" ||
    !container.days ||
    typeof container.days !== "object" ||
    Array.isArray(container.days)
  ) {
    return null;
  }

  return (
    container.days[String(day)] ||
    null
  );
}


function getSourceType(entry) {
  return String(
    entry?.source_type || ""
  )
    .trim()
    .toLowerCase();
}


function unique(values) {
  return [
    ...new Set(
      values
        .filter(
          value =>
            value !== undefined &&
            value !== null &&
            String(value).trim() !== ""
        )
        .map(String)
    )
  ];
}


function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}


function hasOwn(
  object,
  key
) {
  return Object.prototype.hasOwnProperty.call(
    object,
    key
  );
}


/* ==========================================================================
   DAY-LEVEL SOURCE ENTRIES
========================================================================== */

const daySources = {
  constitutional:
    constitutionalEntry,

  historical:
    getDaySource(
      HISTORICAL,
      DAY
    ),

  legal:
    getDaySource(
      LEGAL,
      DAY
    ),

  judicial:
    getDaySource(
      JUDICIAL,
      DAY
    ),

  official:
    getDaySource(
      OFFICIAL,
      DAY
    )
};


/* ==========================================================================
   SOURCE-MAP VALIDATION
========================================================================== */

function validateSourceMap() {
  const errors = [];

  const expectedFiles = {
    constitutional:
      FILES.constitutional,

    historical:
      FILES.historical,

    legal:
      FILES.legal,

    judicial:
      FILES.judicial,

    official:
      FILES.official
  };

  if (
    !SOURCE_MAP.source_files ||
    typeof SOURCE_MAP.source_files !== "object" ||
    Array.isArray(SOURCE_MAP.source_files)
  ) {
    errors.push(
      "source-map.json is missing source_files"
    );
  } else {
    for (
      const [layer, fileName]
      of Object.entries(expectedFiles)
    ) {
      if (
        SOURCE_MAP.source_files[layer] !==
        fileName
      ) {
        errors.push(
          `source-map.json source_files.${layer} must be "${fileName}"`
        );
      }
    }
  }

  if (
    !SOURCE_MAP.validation ||
    typeof SOURCE_MAP.validation !== "object"
  ) {
    errors.push(
      "source-map.json is missing validation"
    );
  } else if (
    !Array.isArray(
      SOURCE_MAP.validation.allowed_source_types
    )
  ) {
    errors.push(
      "source-map.json is missing validation.allowed_source_types"
    );
  } else {
    for (
      const type
      of SOURCE_MAP.validation.allowed_source_types
    ) {
      if (
        !ALLOWED_SOURCE_LAYERS.has(type)
      ) {
        errors.push(
          `source-map.json contains unsupported source type "${type}"`
        );
      }
    }
  }

  if (
    SOURCE_MAP.day_map !== undefined &&
    (
      SOURCE_MAP.day_map === null ||
      typeof SOURCE_MAP.day_map !== "object" ||
      Array.isArray(SOURCE_MAP.day_map)
    )
  ) {
    errors.push(
      "source-map.json day_map must be an object"
    );
  }

  return errors;
}


/* ==========================================================================
   DETERMINE REQUIRED SOURCE LAYERS
========================================================================== */

/*
  ROUTING

  constitutional
      -> constitutional only

  conceptual
      -> constitutional only

  historical
      -> constitutional + historical

  statutory
      -> constitutional + legal

  judicial
      -> constitutional + judicial

  mixed
      -> constitutional +
         explicitly declared additional_sources +
         actual day-level source registry mappings

  A mixed day does NOT automatically require
  every possible source layer.
*/

function determineRequiredLayers() {
  const layers = [
    "constitutional"
  ];

  const constitutionalType =
    getSourceType(
      constitutionalEntry
    );

  const additional =
    Array.isArray(
      constitutionalEntry.additional_sources
    )
      ? constitutionalEntry.additional_sources
      : [];

  if (
    constitutionalType === "historical" ||
    additional.includes(
      "historical-sources.json"
    ) ||
    daySources.historical
  ) {
    layers.push(
      "historical"
    );
  }

  if (
    constitutionalType === "statutory" ||
    additional.includes(
      "legal-sources.json"
    ) ||
    daySources.legal
  ) {
    layers.push(
      "legal"
    );
  }

  if (
    constitutionalType === "judicial" ||
    additional.includes(
      "judicial-sources.json"
    ) ||
    daySources.judicial
  ) {
    layers.push(
      "judicial"
    );
  }

  if (
    additional.includes(
      "official-sources.json"
    ) ||
    daySources.official
  ) {
    layers.push(
      "official"
    );
  }

  return unique(
    layers
  );
}

const requiredLayers =
  determineRequiredLayers();


/* ==========================================================================
   SYLLABUS VALIDATION
========================================================================== */

function validateSyllabus() {
  const errors = [];

  const allDays =
    SYLLABUS.map(
      item => Number(item?.day)
    );

  const uniqueDays =
    new Set(allDays);

  if (
    uniqueDays.size !== 365
  ) {
    errors.push(
      "syllabus.json contains duplicate day numbers"
    );
  }

  for (
    let day = 1;
    day <= 365;
    day++
  ) {
    if (
      !uniqueDays.has(day)
    ) {
      errors.push(
        `syllabus.json is missing day ${day}`
      );
    }
  }

  if (
    Number(syllabusEntry.day) !== DAY
  ) {
    errors.push(
      `Day ${DAY}: syllabus day mismatch`
    );
  }

  for (
    const field
    of ["title", "stage", "focus"]
  ) {
    if (
      typeof syllabusEntry[field] !==
        "string" ||
      syllabusEntry[field].trim() === ""
    ) {
      errors.push(
        `Day ${DAY}: syllabus field "${field}" is missing`
      );
    }
  }

  return errors;
}


/* ==========================================================================
   CONSTITUTIONAL SOURCE VALIDATION
========================================================================== */

function validateConstitutionalSource() {
  const errors = [];

  const entry =
    daySources.constitutional;

  if (!entry) {
    errors.push(
      `Day ${DAY}: constitutional source missing`
    );

    return errors;
  }

  if (!isPlainObject(entry)) {
    errors.push(
      `Day ${DAY}: constitutional source must be an object`
    );

    return errors;
  }

  const sourceType =
    getSourceType(entry);

  if (
    !ALLOWED_CONSTITUTIONAL_TYPES.has(
      sourceType
    )
  ) {
    errors.push(
      `Day ${DAY}: unsupported source_type "${sourceType}"`
    );
  }

  for (
    const field
    of [
      "articles",
      "parts",
      "references"
    ]
  ) {
    if (
      !Array.isArray(entry[field])
    ) {
      errors.push(
        `Day ${DAY}: constitutional ${field} must be an array`
      );
    }
  }

  if (
    entry.additional_sources !== undefined &&
    !Array.isArray(
      entry.additional_sources
    )
  ) {
    errors.push(
      `Day ${DAY}: additional_sources must be an array`
    );
  }

  if (
    Array.isArray(
      entry.additional_sources
    )
  ) {
    const allowedAdditional = new Set([
      "historical-sources.json",
      "legal-sources.json",
      "judicial-sources.json",
      "official-sources.json"
    ]);

    for (
      const sourceFile
      of entry.additional_sources
    ) {
      if (
        !allowedAdditional.has(
          sourceFile
        )
      ) {
        errors.push(
          `Day ${DAY}: unsupported additional source "${sourceFile}"`
        );
      }
    }
  }

  return errors;
}


/* ==========================================================================
   REQUIRED SOURCE ENTRY VALIDATION
========================================================================== */

function validateRequiredSources() {
  const errors = [];

  for (
    const layer
    of requiredLayers
  ) {
    if (
      !daySources[layer]
    ) {
      errors.push(
        `Missing ${layer} source entry for day ${DAY}`
      );
    }
  }

  return errors;
}


/* ==========================================================================
   LEGAL SOURCE VALIDATION
========================================================================== */

function validateLegalSources() {
  const errors = [];

  const entry =
    daySources.legal;

  if (!entry) {
    return errors;
  }

  if (
    !isPlainObject(entry)
  ) {
    errors.push(
      `Day ${DAY}: legal source entry must be an object`
    );

    return errors;
  }

  if (
    String(entry.status || "")
      .trim()
      .toLowerCase() ===
    "unresolved"
  ) {
    errors.push(
      `Day ${DAY}: legal source entry is explicitly unresolved`
    );
  }

  if (
    !Array.isArray(
      entry.legal_sources
    )
  ) {
    errors.push(
      `Day ${DAY}: legal_sources must be an array`
    );

    return errors;
  }

  const registry =
    Array.isArray(
      LEGAL.primary_legal_sources
    )
      ? LEGAL.primary_legal_sources
      : [];

  const validIds =
    new Set(
      registry
        .map(
          source =>
            source &&
            source.id
        )
        .filter(Boolean)
    );

  const declared =
    unique(
      entry.legal_sources
    );

  if (
    declared.length === 0
  ) {
    errors.push(
      `Day ${DAY}: legal source entry contains no resolved legal source`
    );
  }

  for (
    const sourceId
    of declared
  ) {
    if (
      !validIds.has(
        sourceId
      )
    ) {
      errors.push(
        `Day ${DAY}: unresolved legal source "${sourceId}"`
      );
    }
  }

  return errors;
}


/* ==========================================================================
   HISTORICAL SOURCE VALIDATION
========================================================================== */

function validateHistoricalSources() {
  const errors = [];

  const entry =
    daySources.historical;

  if (!entry) {
    return errors;
  }

  if (
    !isPlainObject(entry)
  ) {
    errors.push(
      `Day ${DAY}: historical source entry must be an object`
    );

    return errors;
  }

  if (
    String(entry.status || "")
      .trim()
      .toLowerCase() ===
    "unresolved"
  ) {
    errors.push(
      `Day ${DAY}: historical source entry is unresolved`
    );
  }

  if (
    !Array.isArray(
      entry.sources
    )
  ) {
    errors.push(
      `Day ${DAY}: historical sources must be an array`
    );

    return errors;
  }

  const registry =
    Array.isArray(
      HISTORICAL.primary_historical_sources
    )
      ? HISTORICAL.primary_historical_sources
      : [];

  const validIds =
    new Set(
      registry
        .map(
          source =>
            source &&
            source.id
        )
        .filter(Boolean)
    );

  const declared =
    unique(
      entry.sources
    );

  if (
    declared.length === 0
  ) {
    errors.push(
      `Day ${DAY}: historical source entry contains no resolved source`
    );
  }

  for (
    const sourceId
    of declared
  ) {
    if (
      !validIds.has(
        sourceId
      )
    ) {
      errors.push(
        `Day ${DAY}: unresolved historical source "${sourceId}"`
      );
    }
  }

  return errors;
}


/* ==========================================================================
   JUDICIAL SOURCE VALIDATION
========================================================================== */

function validateJudicialSources() {
  const errors = [];

  const entry =
    daySources.judicial;

  if (!entry) {
    return errors;
  }

  if (
    !isPlainObject(entry)
  ) {
    errors.push(
      `Day ${DAY}: judicial source entry must be an object`
    );

    return errors;
  }

  const caseRegistry =
    isPlainObject(
      JUDICIAL.case_registry
    )
      ? JUDICIAL.case_registry
      : {};

  const doctrineRegistry =
    isPlainObject(
      JUDICIAL.doctrine_registry
    )
      ? JUDICIAL.doctrine_registry
      : {};

  if (
    String(entry.status || "")
      .trim()
      .toLowerCase() ===
    "unresolved"
  ) {
    errors.push(
      `Day ${DAY}: judicial source is unresolved`
    );
  }

  const doctrines =
    Array.isArray(
      entry.doctrines
    )
      ? unique(
          entry.doctrines
        )
      : [];

  const cases =
    Array.isArray(
      entry.cases
    )
      ? unique(
          entry.cases
        )
      : [];

  if (
    doctrines.length === 0 &&
    cases.length === 0
  ) {
    errors.push(
      `Day ${DAY}: judicial source must declare at least one verified doctrine or case`
    );

    return errors;
  }

  for (
    const doctrineId
    of doctrines
  ) {
    const doctrine =
      doctrineRegistry[
        doctrineId
      ];

    if (!doctrine) {
      errors.push(
        `Day ${DAY}: unresolved judicial doctrine "${doctrineId}"`
      );

      continue;
    }

    if (
      String(
        doctrine.status || ""
      )
        .trim()
        .toLowerCase() ===
      "requires_verified_case_sources"
    ) {
      errors.push(
        `Day ${DAY}: doctrine "${doctrineId}" requires verified case sources`
      );
    }

    const caseSources =
      Array.isArray(
        doctrine.case_sources
      )
        ? unique(
            doctrine.case_sources
          )
        : [];

    if (
      caseSources.length === 0
    ) {
      errors.push(
        `Day ${DAY}: doctrine "${doctrineId}" has no verified case sources`
      );
    }

    for (
      const caseId
      of caseSources
    ) {
      if (
        !caseRegistry[caseId]
      ) {
        errors.push(
          `Day ${DAY}: doctrine "${doctrineId}" references unresolved case "${caseId}"`
        );
      }
    }
  }

  for (
    const caseId
    of cases
  ) {
    if (
      !caseRegistry[caseId]
    ) {
      errors.push(
        `Day ${DAY}: unresolved judicial case "${caseId}"`
      );
    }
  }

  return errors;
}


/* ==========================================================================
   OFFICIAL SOURCE VALIDATION
========================================================================== */

function validateOfficialSources() {
  const errors = [];

  const entry =
    daySources.official;

  if (!entry) {
    return errors;
  }

  if (
    !isPlainObject(entry)
  ) {
    errors.push(
      `Day ${DAY}: official source entry must be an object`
    );

    return errors;
  }

  if (
    String(entry.status || "")
      .trim()
      .toLowerCase() ===
    "unresolved"
  ) {
    errors.push(
      `Day ${DAY}: official source entry is unresolved`
    );
  }

  if (
    !Array.isArray(
      entry.sources
    )
  ) {
    errors.push(
      `Day ${DAY}: official sources must be an array`
    );

    return errors;
  }

  const registry =
    Array.isArray(
      OFFICIAL.primary_official_sources
    )
      ? OFFICIAL.primary_official_sources
      : [];

  const validIds =
    new Set(
      registry
        .map(
          source =>
            source &&
            source.id
        )
        .filter(Boolean)
    );

  const declared =
    unique(
      entry.sources
    );

  if (
    declared.length === 0
  ) {
    errors.push(
      `Day ${DAY}: official source entry contains no resolved source`
    );
  }

  for (
    const sourceId
    of declared
  ) {
    if (
      !validIds.has(
        sourceId
      )
    ) {
      errors.push(
        `Day ${DAY}: unresolved official source "${sourceId}"`
      );
    }
  }

  return errors;
}


/* ==========================================================================
   SOURCE VALIDATION
========================================================================== */

function validateAllSources() {
  const errors = [];

  errors.push(
    ...validateSourceMap()
  );

  errors.push(
    ...validateSyllabus()
  );

  errors.push(
    ...validateConstitutionalSource()
  );

  errors.push(
    ...validateRequiredSources()
  );

  errors.push(
    ...validateLegalSources()
  );

  errors.push(
    ...validateHistoricalSources()
  );

  errors.push(
    ...validateJudicialSources()
  );

  errors.push(
    ...validateOfficialSources()
  );

  if (
    errors.length > 0
  ) {
    throw new Error(
      errors.join("\n")
    );
  }
}


/* ==========================================================================
   BUILD SOURCE CONTEXT
========================================================================== */

function buildSourceContext() {
  const context = {
    day: DAY,

    syllabus: {
      day: syllabusEntry.day,
      title: syllabusEntry.title,
      stage: syllabusEntry.stage,
      focus: syllabusEntry.focus
    },

    constitutional: {
      source_type:
        constitutionalEntry.source_type ||
        null,

      articles:
        Array.isArray(
          constitutionalEntry.articles
        )
          ? constitutionalEntry.articles
          : [],

      parts:
        Array.isArray(
          constitutionalEntry.parts
        )
          ? constitutionalEntry.parts
          : [],

      references:
        Array.isArray(
          constitutionalEntry.references
        )
          ? constitutionalEntry.references
          : [],

      additional_sources:
        Array.isArray(
          constitutionalEntry.additional_sources
        )
          ? constitutionalEntry.additional_sources
          : []
    },

    historical:
      daySources.historical,

    legal:
      daySources.legal,

    judicial:
      daySources.judicial,

    official:
      daySources.official
  };

  return JSON.stringify(
    context,
    null,
    2
  );
}


/* ==========================================================================
   PROMPT
========================================================================== */

function buildPrompt() {
  const sourceContext =
    buildSourceContext();

  return `
You are generating Day ${DAY} of VIDHWAAN CONSTITUTION 365.

This is a Telugu constitutional education program.

The supplied syllabus is INTERNAL planning data.
It may contain English.
Do NOT copy its English learner-facing text into the final output.

The final learner-facing content MUST be written entirely in Telugu.

AUTHORITATIVE SOURCE CONTEXT
=============================

${sourceContext}

SOURCE DISCIPLINE
=================

Use ONLY the supplied authoritative source context.

Do not invent:
- constitutional provisions
- Article numbers
- Parts
- constitutional doctrines
- statutes
- sections
- judicial cases
- judgments
- historical events
- institutional facts
- dates
- legal propositions

If a fact is not supported by the supplied source context,
do not invent it.

Keep these categories separate:

1. Constitution text and constitutional provisions
2. Historical context
3. Statutory law
4. Judicial interpretation
5. Official institutional information

Do not present statutory law as if it were constitutional text.

Do not present judicial interpretation as if it were the constitutional text.

Do not present historical claims as constitutional provisions.

Do not invent case names or holdings.

Do not invent statutory sections.

TELUGU OUTPUT REQUIREMENT
=========================

Every learner-facing text value MUST be Telugu.

The following fields MUST contain Telugu only:

- title
- stage
- focus
- lesson
- examples
- why_it_matters
- common_misunderstanding
- reflection
- every MCQ question
- every MCQ option
- every MCQ answer
- every MCQ explanation

Do NOT use English alphabet letters A-Z or a-z
inside any of those learner-facing fields.

Do NOT use Romanized Telugu.

Do NOT use English words.

Do NOT use English abbreviations.

Do NOT use English labels.

Use Telugu script for unavoidable concepts wherever a Telugu equivalent can be used.

Technical metadata such as:
- JSON property names
- constitutional_reference
- source_metadata
- Article references
- source IDs
- source file names

is internal metadata and is NOT learner-facing.

Do not translate or alter authoritative technical metadata.

CONTENT REQUIREMENTS
====================

Create a clear, accurate and useful lesson for the learner.

The lesson should explain the assigned constitutional topic
using the supplied authoritative sources.

Use simple, natural Telugu.

The content should be educational rather than promotional.

Explain the constitutional significance clearly.

Use practical examples where appropriate.

Do not create unsupported hypothetical legal conclusions.

EXAMPLES
========

Provide at least 3 useful examples.

Each example must be written entirely in Telugu.

MCQs
====

Create exactly 5 MCQs.

Each MCQ must contain:
- question
- exactly 4 options
- answer
- explanation

The answer must exactly match one of the four options.

All MCQ learner-facing text must be entirely in Telugu.

Do not use A/B/C/D as option labels.

ACCURACY
========

Accuracy is more important than completeness.

If the supplied source context does not support a claim,
omit the claim rather than guessing.

OUTPUT FORMAT
=============

Return ONLY valid JSON.

Use exactly this structure:

{
  "day": ${DAY},
  "title": "తెలుగు శీర్షిక",
  "stage": "తెలుగు దశ",
  "focus": "తెలుగు అంశం",
  "lesson": "తెలుగు పాఠం",
  "examples": [
    "తెలుగు ఉదాహరణ 1",
    "తెలుగు ఉదాహరణ 2",
    "తెలుగు ఉదాహరణ 3"
  ],
  "why_it_matters": "తెలుగు వివరణ",
  "common_misunderstanding": "తెలుగు వివరణ",
  "reflection": "తెలుగు ఆలోచన ప్రశ్న",
  "mcqs": [
    {
      "question": "తెలుగు ప్రశ్న",
      "options": [
        "తెలుగు ఎంపిక 1",
        "తెలుగు ఎంపిక 2",
        "తెలుగు ఎంపిక 3",
        "తెలుగు ఎంపిక 4"
      ],
      "answer": "తెలుగు సరైన ఎంపిక",
      "explanation": "తెలుగు వివరణ"
    }
  ],
  "constitutional_reference": {
    "articles": [],
    "parts": [],
    "references": []
  },
  "source_metadata": {}
}

The generator will replace authoritative metadata fields after generation.

IMPORTANT:
The final learner-facing strings must contain ZERO English alphabet letters.
`.trim();
}


/* ==========================================================================
   GROQ
========================================================================== */

async function callGroq(
  attempt
) {
  const key =
    process.env.GROQ_API_KEY;

  if (!key) {
    throw new Error(
      "GROQ_API_KEY is not configured"
    );
  }

  const prompt =
    buildPrompt();

  const response =
    await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${key}`
        },

        body:
          JSON.stringify({
            model:
              process.env.GROQ_MODEL ||
              "openai/gpt-oss-120b",

            temperature:
              0.20,

            reasoning_effort:
              "high",

            max_tokens:
              10000,

            response_format: {
              type: "json_object"
            },

            messages: [
              {
                role: "system",

                content:
                  "You are an exceptionally careful Telugu constitutional educator. Use only the supplied authoritative source context. Never invent constitutional, historical, statutory, judicial or institutional facts. Every learner-facing text field must contain Telugu only and must contain zero English alphabet letters. Return only valid JSON."
              },

              {
                role: "user",

                content:
                  prompt
              }
            ]
          })
      }
    );

  if (!response.ok) {
    const body =
      await response.text();

    throw new Error(
      `Groq HTTP ${response.status}: ${body}`
    );
  }

  const json =
    await response.json();

  const content =
    json?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(
      "Groq returned no content"
    );
  }

  try {
    return JSON.parse(
      content
    );
  } catch (error) {
    throw new Error(
      `Groq returned invalid JSON on attempt ${attempt}: ${error.message}`
    );
  }
}


/* ==========================================================================
   SCRIPT VALIDATION
========================================================================== */

const FORBIDDEN_SCRIPT_RANGES = [
  /[\u0400-\u04FF]/,
  /[\u0370-\u03FF]/,
  /[\u0590-\u05FF]/,
  /[\u0600-\u06FF]/,
  /[\u0700-\u074F]/,
  /[\u0780-\u07BF]/,
  /[\u0900-\u097F]/,
  /[\u0980-\u09FF]/,
  /[\u0A00-\u0A7F]/,
  /[\u0A80-\u0AFF]/,
  /[\u0B00-\u0B7F]/,
  /[\u0B80-\u0BFF]/,
  /[\u0C80-\u0CFF]/,
  /[\u0D00-\u0D7F]/,
  /[\u0D80-\u0DFF]/,
  /[\u0E00-\u0E7F]/,
  /[\u0E80-\u0EFF]/,
  /[\u1000-\u109F]/,
  /[\u1100-\u11FF]/,
  /[\u3040-\u30FF]/,
  /[\u3400-\u4DBF]/,
  /[\u4E00-\u9FFF]/,
  /[\uAC00-\uD7AF]/,
  /[\uF900-\uFAFF]/,
  /[\uFF66-\uFF9F]/
];


function findForbiddenScripts(
  value
) {
  if (
    typeof value !== "string"
  ) {
    return [];
  }

  const found = [];

  for (
    const pattern
    of FORBIDDEN_SCRIPT_RANGES
  ) {
    if (
      pattern.test(value)
    ) {
      found.push(
        pattern.source
      );
    }
  }

  return found;
}


function containsTelugu(
  value
) {
  return (
    typeof value === "string" &&
    /[\u0C00-\u0C7F]/.test(
      value
    )
  );
}


/* ==========================================================================
   TELUGU STRING VALIDATION
========================================================================== */

function validateTeluguString(
  value,
  fieldName
) {
  const errors = [];

  if (
    typeof value !== "string"
  ) {
    errors.push(
      `${fieldName} must be a string`
    );

    return errors;
  }

  if (
    value.trim() === ""
  ) {
    errors.push(
      `${fieldName} must not be empty`
    );

    return errors;
  }

  /*
   * FINAL REQUIREMENT:
   * No English alphabet characters are
   * allowed in learner-facing content.
   */

  if (
    /[A-Za-z]/.test(value)
  ) {
    errors.push(
      `${fieldName} contains English letters`
    );
  }

  if (
    !containsTelugu(value)
  ) {
    errors.push(
      `${fieldName} must contain Telugu text`
    );
  }

  const forbidden =
    findForbiddenScripts(
      value
    );

  if (
    forbidden.length > 0
  ) {
    errors.push(
      `${fieldName} contains unsupported foreign-script characters`
    );
  }

  /*
   * Detect replacement/corruption characters.
   */

  if (
    value.includes("\uFFFD")
  ) {
    errors.push(
      `${fieldName} contains Unicode replacement character`
    );
  }

  /*
   * Detect zero-width/control characters
   * except normal whitespace.
   */

  if (
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(
      value
    )
  ) {
    errors.push(
      `${fieldName} contains invalid control characters`
    );
  }

  return errors;
}


/* ==========================================================================
   TELUGU CONTENT VALIDATION
========================================================================== */

function validateTeluguContent(
  x
) {
  const errors = [];

  for (
    const field
    of REQUIRED_TEXT_FIELDS
  ) {
    errors.push(
      ...validateTeluguString(
        x[field],
        field
      )
    );
  }

  if (
    !Array.isArray(x.examples)
  ) {
    errors.push(
      "examples must be an array"
    );
  } else {
    x.examples.forEach(
      (
        example,
        index
      ) => {
        errors.push(
          ...validateTeluguString(
            example,
            `Example ${index + 1}`
          )
        );
      }
    );
  }

  if (
    !Array.isArray(x.mcqs)
  ) {
    return errors;
  }

  x.mcqs.forEach(
    (
      mcq,
      index
    ) => {
      const n =
        index + 1;

      if (
        !mcq ||
        typeof mcq !== "object"
      ) {
        errors.push(
          `MCQ ${n} must be an object`
        );

        return;
      }

      errors.push(
        ...validateTeluguString(
          mcq.question,
          `MCQ ${n} question`
        )
      );

      if (
        Array.isArray(
          mcq.options
        )
      ) {
        mcq.options.forEach(
          (
            option,
            optionIndex
          ) => {
            errors.push(
              ...validateTeluguString(
                option,
                `MCQ ${n} option ${optionIndex + 1}`
              )
            );
          }
        );
      }

      errors.push(
        ...validateTeluguString(
          mcq.answer,
          `MCQ ${n} answer`
        )
      );

      errors.push(
        ...validateTeluguString(
          mcq.explanation,
          `MCQ ${n} explanation`
        )
      );
    }
  );

  return errors;
}


/* ==========================================================================
   GENERATED CONTENT VALIDATION
========================================================================== */

function validateGeneratedContent(
  x
) {
  if (
    !x ||
    typeof x !== "object" ||
    Array.isArray(x)
  ) {
    throw new Error(
      "Generated result is not an object"
    );
  }

  if (
    Number(x.day) !== DAY
  ) {
    throw new Error(
      "Generated day mismatch"
    );
  }

  for (
    const field
    of [
      "title",
      "stage",
      "focus",
      "lesson",
      "why_it_matters",
      "common_misunderstanding",
      "reflection"
    ]
  ) {
    if (
      typeof x[field] !== "string"
    ) {
      throw new Error(
        `Missing or invalid field: ${field}`
      );
    }
  }

  if (
    x.lesson.trim().length < 500
  ) {
    throw new Error(
      "Lesson is too short"
    );
  }

  if (
    x.lesson.trim().length > 30000
  ) {
    throw new Error(
      "Lesson is excessively long"
    );
  }

  if (
    !Array.isArray(x.examples) ||
    x.examples.length < 3
  ) {
    throw new Error(
      "At least 3 examples are required"
    );
  }

  if (
    x.examples.length > 8
  ) {
    throw new Error(
      "Too many examples"
    );
  }

  for (
    const [
      index,
      example
    ]
    of x.examples.entries()
  ) {
    if (
      typeof example !== "string" ||
      example.trim().length < 20
    ) {
      throw new Error(
        `Example ${index + 1} is too short`
      );
    }

    if (
      example.trim().length > 2500
    ) {
      throw new Error(
        `Example ${index + 1} is too long`
      );
    }
  }

  if (
    x.why_it_matters.trim().length < 100
  ) {
    throw new Error(
      "why_it_matters is too short"
    );
  }

  if (
    x.common_misunderstanding.trim().length < 50
  ) {
    throw new Error(
      "common_misunderstanding is too short"
    );
  }

  if (
    x.reflection.trim().length < 20
  ) {
    throw new Error(
      "Reflection is too short"
    );
  }

  if (
    !Array.isArray(x.mcqs) ||
    x.mcqs.length !== 5
  ) {
    throw new Error(
      "Exactly 5 MCQs are required"
    );
  }

  x.mcqs.forEach(
    (
      mcq,
      index
    ) => {
      const n =
        index + 1;

      if (
        !mcq ||
        typeof mcq !== "object" ||
        Array.isArray(mcq)
      ) {
        throw new Error(
          `MCQ ${n} must be an object`
        );
      }

      if (
        typeof mcq.question !==
          "string" ||
        !Array.isArray(
          mcq.options
        ) ||
        mcq.options.length !== 4 ||
        typeof mcq.answer !==
          "string" ||
        typeof mcq.explanation !==
          "string"
      ) {
        throw new Error(
          `Invalid MCQ ${n}`
        );
      }

      const options =
        mcq.options.map(
          option =>
            String(option)
              .trim()
        );

      const answer =
        String(
          mcq.answer
        ).trim();

      if (
        options.some(
          option =>
            option.length === 0
        )
      ) {
        throw new Error(
          `MCQ ${n}: empty option`
        );
      }

      if (
        new Set(options).size !==
        4
      ) {
        throw new Error(
          `MCQ ${n}: options must be unique`
        );
      }

      if (
        !options.includes(
          answer
        )
      ) {
        throw new Error(
          `MCQ ${n}: answer is not exactly one of the options`
        );
      }

      if (
        mcq.question.trim().length <
        10
      ) {
        throw new Error(
          `MCQ ${n}: question is too short`
        );
      }

      if (
        mcq.question.trim().length >
        1500
      ) {
        throw new Error(
          `MCQ ${n}: question is too long`
        );
      }

      if (
        mcq.explanation.trim().length <
        20
      ) {
        throw new Error(
          `MCQ ${n}: explanation is too short`
        );
      }
    }
  );

  if (
    !isPlainObject(
      x.constitutional_reference
    )
  ) {
    throw new Error(
      "Missing constitutional_reference"
    );
  }

  for (
    const field
    of [
      "articles",
      "parts",
      "references"
    ]
  ) {
    if (
      !Array.isArray(
        x.constitutional_reference[
          field
        ]
      )
    ) {
      throw new Error(
        `constitutional_reference.${field} must be an array`
      );
    }
  }

  const teluguErrors =
    validateTeluguContent(
      x
    );

  if (
    teluguErrors.length > 0
  ) {
    throw new Error(
      teluguErrors.join(
        "; "
      )
    );
  }

  return x;
}


/* ==========================================================================
   AUTHORITATIVE FIELD RESTORATION
========================================================================== */

function restoreAuthoritativeFields(
  generated
) {
  /*
   * IMPORTANT:
   * Do NOT restore title/stage/focus from syllabus.
   * The syllabus may be English/internal.
   * The generated learner-facing values must remain Telugu.
   */

  generated.day =
    DAY;

  generated.constitutional_reference = {
    articles:
      Array.isArray(
        constitutionalEntry.articles
      )
        ? constitutionalEntry.articles
        : [],

    parts:
      Array.isArray(
        constitutionalEntry.parts
      )
        ? constitutionalEntry.parts
        : [],

    references:
      Array.isArray(
        constitutionalEntry.references
      )
        ? constitutionalEntry.references
        : []
  };

  generated.source_metadata = {
    source_layers:
      requiredLayers,

    source_files:
      requiredLayers.map(
        layer =>
          FILES[layer]
      ),

    source_status:
      "validated-before-generation",

    source_day:
      DAY,

    constitutional_source_type:
      constitutionalEntry.source_type ||
      null,

    additional_sources:
      Array.isArray(
        constitutionalEntry.additional_sources
      )
        ? constitutionalEntry.additional_sources
        : [],

    legal_source_ids:
      daySources.legal &&
      Array.isArray(
        daySources.legal.legal_sources
      )
        ? unique(
            daySources.legal.legal_sources
          )
        : [],

    historical_source_ids:
      daySources.historical &&
      Array.isArray(
        daySources.historical.sources
      )
        ? unique(
            daySources.historical.sources
          )
        : [],

    judicial_doctrines:
      daySources.judicial &&
      Array.isArray(
        daySources.judicial.doctrines
      )
        ? unique(
            daySources.judicial.doctrines
          )
        : [],

    judicial_cases:
      daySources.judicial &&
      Array.isArray(
        daySources.judicial.cases
      )
        ? unique(
            daySources.judicial.cases
          )
        : [],

    official_source_ids:
      daySources.official &&
      Array.isArray(
        daySources.official.sources
      )
        ? unique(
            daySources.official.sources
          )
        : []
  };

  return generated;
}


/* ==========================================================================
   FINAL OUTPUT VALIDATION
========================================================================== */

function validateFinalOutput(
  output
) {
  validateGeneratedContent(
    output
  );

  if (
    Number(output.day) !== DAY
  ) {
    throw new Error(
      "Final output day mismatch"
    );
  }

  /*
   * Do NOT compare title/stage/focus
   * against the English syllabus.
   *
   * They are learner-facing AI-generated
   * Telugu fields and have already passed
   * the strict Telugu validation above.
   */

  const expectedArticles =
    JSON.stringify(
      constitutionalEntry.articles ||
      []
    );

  const actualArticles =
    JSON.stringify(
      output
        .constitutional_reference
        ?.articles ||
      []
    );

  if (
    expectedArticles !==
    actualArticles
  ) {
    throw new Error(
      "Final constitutional articles do not match authoritative source"
    );
  }

  const expectedParts =
    JSON.stringify(
      constitutionalEntry.parts ||
      []
    );

  const actualParts =
    JSON.stringify(
      output
        .constitutional_reference
        ?.parts ||
      []
    );

  if (
    expectedParts !==
    actualParts
  ) {
    throw new Error(
      "Final constitutional parts do not match authoritative source"
    );
  }

  const expectedReferences =
    JSON.stringify(
      constitutionalEntry.references ||
      []
    );

  const actualReferences =
    JSON.stringify(
      output
        .constitutional_reference
        ?.references ||
      []
    );

  if (
    expectedReferences !==
    actualReferences
  ) {
    throw new Error(
      "Final constitutional references do not match authoritative source"
    );
  }

  if (
    !isPlainObject(
      output.source_metadata
    )
  ) {
    throw new Error(
      "Missing final source metadata"
    );
  }

  if (
    !Array.isArray(
      output.source_metadata.source_layers
    )
  ) {
    throw new Error(
      "source_metadata.source_layers must be an array"
    );
  }

  if (
    JSON.stringify(
      output.source_metadata.source_layers
    ) !==
    JSON.stringify(
      requiredLayers
    )
  ) {
    throw new Error(
      "Final source layers do not match validated routing"
    );
  }

  if (
    Number(
      output.source_metadata.source_day
    ) !== DAY
  ) {
    throw new Error(
      "Final source metadata day mismatch"
    );
  }

  if (
    output.source_metadata.source_status !==
    "validated-before-generation"
  ) {
    throw new Error(
      "Invalid source metadata status"
    );
  }

  const expectedFiles =
    requiredLayers.map(
      layer =>
        FILES[layer]
    );

  if (
    JSON.stringify(
      output.source_metadata.source_files
    ) !==
    JSON.stringify(
      expectedFiles
    )
  ) {
    throw new Error(
      "Final source metadata files do not match required layers"
    );
  }
}


/* ==========================================================================
   RETRY DELAY
========================================================================== */

function sleep(
  milliseconds
) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}


/* ==========================================================================
   GENERATE AND VALIDATE
========================================================================== */

async function generateValidatedOutput() {
  let lastError = null;

  for (
    let attempt = 1;
    attempt <= MAX_GENERATION_ATTEMPTS;
    attempt++
  ) {
    console.log(
      `Generation attempt ${attempt}/${MAX_GENERATION_ATTEMPTS}`
    );

    try {
      const generated =
        await callGroq(
          attempt
        );

      validateGeneratedContent(
        generated
      );

      console.log(
        "AI content validation passed."
      );

      const finalOutput =
        restoreAuthoritativeFields(
          generated
        );

      validateFinalOutput(
        finalOutput
      );

      console.log(
        "Final output validation passed."
      );

      return finalOutput;

    } catch (error) {
      lastError =
        error;

      console.error(
        `Attempt ${attempt} failed: ${error.message}`
      );

      if (
        attempt <
        MAX_GENERATION_ATTEMPTS
      ) {
        await sleep(
          2500 * attempt
        );
      }
    }
  }

  throw new Error(
    `Generation failed after ${MAX_GENERATION_ATTEMPTS} validated attempts: ${lastError?.message || "unknown error"}`
  );
}


/* ==========================================================================
   MAIN
========================================================================== */

(async () => {
  console.log("");

  console.log(
    "=========================================="
  );

  console.log(
    "CONSTITUTION 365 GENERATOR"
  );

  console.log(
    "=========================================="
  );

  console.log(
    `Day: ${DAY}`
  );

  console.log(
    `Title: ${syllabusEntry.title}`
  );

  console.log(
    `Required sources: ${requiredLayers.join(", ")}`
  );

  console.log(
    "=========================================="
  );

  console.log("");

  console.log(
    "Authoritative source validation passed."
  );

  console.log(
    "Source routing validation passed."
  );

  console.log(
    "Strict Telugu-only learner content enabled."
  );

  console.log(
    "English-letter rejection enabled."
  );

  console.log(
    "Strict constitutional accuracy rules enabled."
  );

  console.log(
    "Validated generation retries enabled."
  );

  console.log("");

  /*
   * Run complete source validation before generation.
   */

  validateAllSources();

  if (
    VALIDATE_ONLY
  ) {
    console.log(
      "Validation-only mode: PASSED."
    );

    process.exit(0);
  }

  console.log(
    "Calling Groq..."
  );

  const finalOutput =
    await generateValidatedOutput();

  const output =
    path.join(
      DATA,
      `day-${String(DAY).padStart(3, "0")}.json`
    );

  fs.mkdirSync(
    DATA,
    {
      recursive: true
    }
  );

  /*
   * Write ONLY after all validation has passed.
   */

  fs.writeFileSync(
    output,
    JSON.stringify(
      finalOutput,
      null,
      2
    ) + "\n",
    "utf8"
  );

  /*
   * Re-read from disk and validate again.
   */

  let written;

  try {
    written =
      JSON.parse(
        fs.readFileSync(
          output,
          "utf8"
        )
      );
  } catch (error) {
    throw new Error(
      `Generated file is not valid JSON: ${error.message}`
    );
  }

  validateFinalOutput(
    written
  );

  console.log("");

  console.log(
    "=========================================="
  );

  console.log(
    "GENERATION SUCCESSFUL"
  );

  console.log(
    "=========================================="
  );

  console.log(
    `Created: ${output}`
  );

  console.log(
    `Day ${DAY} generated with ${written.mcqs.length} MCQs.`
  );

  console.log(
    `Sources: ${requiredLayers.join(", ")}`
  );

  console.log(
    "Telugu-only learner content: PASSED"
  );

  console.log(
    "English-letter validation: PASSED"
  );

  console.log(
    "Final disk validation: PASSED"
  );

  console.log(
    "=========================================="
  );

})().catch(
  error => {
    console.error("");

    console.error(
      "=========================================="
    );

    console.error(
      "GENERATION FAILED"
    );

    console.error(
      "=========================================="
    );

    console.error(
      error.message
    );

    console.error(
      "=========================================="
    );

    process.exit(1);
  }
);
