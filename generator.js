const fs = require("fs");
const path = require("path");

const DAY = Number(process.env.DAY || 0);

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


/* ==========================================================================
   LOAD JSON
========================================================================== */

function loadJson(fileName) {
  const filePath = path.join(DATA, fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Required source file not found: data/${fileName}`
    );
  }

  try {
    return JSON.parse(
      fs.readFileSync(filePath, "utf8")
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
  !CONSTITUTIONAL.days ||
  typeof CONSTITUTIONAL.days !== "object"
) {
  throw new Error(
    "constitutional-sources.json must contain a days object"
  );
}

if (
  !SOURCE_MAP ||
  typeof SOURCE_MAP !== "object"
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
    item => Number(item.day) === DAY
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

function getDaySource(container, day) {
  if (
    !container ||
    !container.days ||
    typeof container.days !== "object"
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
    typeof SOURCE_MAP.source_files !== "object"
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

  const allowedTypes =
    new Set([
      "constitutional",
      "historical",
      "legal",
      "judicial",
      "official"
    ]);

  if (
    !Array.isArray(
      SOURCE_MAP.validation?.allowed_source_types
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
      if (!allowedTypes.has(type)) {
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
  constitutional
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

  A mixed day MUST NOT automatically require
  historical + legal + judicial.
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
      item => Number(item.day)
    );

  const uniqueDays =
    new Set(allDays);

  if (uniqueDays.size !== 365) {
    errors.push(
      "syllabus.json contains duplicate day numbers"
    );
  }

  for (
    let day = 1;
    day <= 365;
    day++
  ) {
    if (!uniqueDays.has(day)) {
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
      typeof syllabusEntry[field] !== "string" ||
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

  const allowedTypes =
    new Set([
      "constitutional",
      "conceptual",
      "historical",
      "statutory",
      "judicial",
      "mixed"
    ]);

  const sourceType =
    getSourceType(entry);

  if (
    !allowedTypes.has(sourceType)
  ) {
    errors.push(
      `Day ${DAY}: unsupported source_type "${sourceType}"`
    );
  }

  if (
    !Array.isArray(entry.articles)
  ) {
    errors.push(
      `Day ${DAY}: constitutional articles must be an array`
    );
  }

  if (
    !Array.isArray(entry.parts)
  ) {
    errors.push(
      `Day ${DAY}: constitutional parts must be an array`
    );
  }

  if (
    !Array.isArray(entry.references)
  ) {
    errors.push(
      `Day ${DAY}: constitutional references must be an array`
    );
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
    if (!daySources[layer]) {
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
    entry.legal_sources;

  for (
    const sourceId
    of declared
  ) {
    if (
      !validIds.has(sourceId)
    ) {
      errors.push(
        `Day ${DAY}: unresolved legal source "${sourceId}"`
      );
    }
  }

  if (
    declared.length === 0
  ) {
    errors.push(
      `Day ${DAY}: legal source entry contains no resolved legal source`
    );
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

  for (
    const sourceId
    of entry.sources
  ) {
    if (
      !validIds.has(sourceId)
    ) {
      errors.push(
        `Day ${DAY}: unresolved historical source "${sourceId}"`
      );
    }
  }

  if (
    entry.sources.length === 0
  ) {
    errors.push(
      `Day ${DAY}: historical source entry contains no resolved source`
    );
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

  const caseRegistry =
    JUDICIAL.case_registry &&
    typeof JUDICIAL.case_registry === "object"
      ? JUDICIAL.case_registry
      : {};

  const doctrineRegistry =
    JUDICIAL.doctrine_registry &&
    typeof JUDICIAL.doctrine_registry === "object"
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

  if (
    Object.keys(caseRegistry).length === 0
  ) {
    errors.push(
      `Day ${DAY}: judicial source registry contains no verified cases`
    );
  }

  const doctrines =
    Array.isArray(
      entry.doctrines
    )
      ? entry.doctrines
      : [];

  for (
    const doctrineId
    of doctrines
  ) {
    const doctrine =
      doctrineRegistry[doctrineId];

    if (!doctrine) {
      errors.push(
        `Day ${DAY}: unresolved judicial doctrine "${doctrineId}"`
      );

      continue;
    }

    const caseSources =
      Array.isArray(
        doctrine.case_sources
      )
        ? doctrine.case_sources
        : [];

    if (
      caseSources.length === 0
    ) {
      errors.push(
        `Day ${DAY}: doctrine "${doctrineId}" has no verified case sources`
      );
    }

    if (
      String(doctrine.status || "")
        .trim()
        .toLowerCase() ===
      "requires_verified_case_sources"
    ) {
      errors.push(
        `Day ${DAY}: doctrine "${doctrineId}" requires verified case sources`
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
          `Day ${DAY}: doctrine "${doctrineId}" references missing case "${caseId}"`
        );
      }
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
    OFFICIAL.institution_registry &&
    typeof OFFICIAL.institution_registry === "object"
      ? OFFICIAL.institution_registry
      : {};

  for (
    const sourceId
    of entry.sources
  ) {
    if (
      !registry[sourceId]
    ) {
      errors.push(
        `Day ${DAY}: unresolved official source "${sourceId}"`
      );
    }
  }

  if (
    entry.sources.length === 0
  ) {
    errors.push(
      `Day ${DAY}: official source entry contains no resolved source`
    );
  }

  return errors;
}


/* ==========================================================================
   SOURCE-MAP DAY ROUTING VALIDATION
========================================================================== */

function validateDayRouting() {
  const errors = [];

  const dayMap =
    SOURCE_MAP.day_map &&
    typeof SOURCE_MAP.day_map === "object"
      ? SOURCE_MAP.day_map
      : {};

  const explicit =
    dayMap[String(DAY)];

  if (!explicit) {
    return errors;
  }

  if (
    !Array.isArray(
      explicit.sources
    )
  ) {
    errors.push(
      `Day ${DAY}: source-map day entry must contain a sources array`
    );

    return errors;
  }

  const allowedLayers =
    new Set([
      "constitutional",
      "historical",
      "legal",
      "judicial",
      "official"
    ]);

  const declaredLayers =
    unique(
      explicit.sources
    );

  for (
    const layer
    of declaredLayers
  ) {
    if (
      !allowedLayers.has(layer)
    ) {
      errors.push(
        `Day ${DAY}: source-map contains unsupported source layer "${layer}"`
      );
    }
  }

  for (
    const layer
    of declaredLayers
  ) {
    if (
      !requiredLayers.includes(layer)
    ) {
      errors.push(
        `Day ${DAY}: source-map declares "${layer}" but authoritative routing does not require it`
      );
    }
  }

  for (
    const layer
    of requiredLayers
  ) {
    if (
      !declaredLayers.includes(layer)
    ) {
      errors.push(
        `Day ${DAY}: authoritative routing requires "${layer}" but source-map does not declare it`
      );
    }
  }

  return errors;
}


/* ==========================================================================
   SOURCE VALIDATION
========================================================================== */

const validationErrors = [
  ...validateSourceMap(),
  ...validateSyllabus(),
  ...validateConstitutionalSource(),
  ...validateRequiredSources(),
  ...validateDayRouting(),
  ...validateLegalSources(),
  ...validateHistoricalSources(),
  ...validateJudicialSources(),
  ...validateOfficialSources()
];

if (
  validationErrors.length > 0
) {
  console.error("");
  console.error(
    "=========================================="
  );
  console.error(
    "SOURCE VALIDATION FAILED"
  );
  console.error(
    "=========================================="
  );

  for (
    const error
    of validationErrors
  ) {
    console.error(
      `ERROR: ${error}`
    );
  }

  console.error("");

  console.error(
    `Day ${DAY} was NOT sent to the AI generator.`
  );

  console.error(
    "=========================================="
  );

  process.exit(1);
}


/* ==========================================================================
   BUILD AUTHORITATIVE SOURCE CONTEXT
========================================================================== */

function buildSourceContext() {
  return {
    constitutional: {
      source_type:
        constitutionalEntry.source_type ||
        null,

      articles:
        constitutionalEntry.articles ||
        [],

      parts:
        constitutionalEntry.parts ||
        [],

      references:
        constitutionalEntry.references ||
        []
    },

    historical:
      daySources.historical
        ? {
            sources:
              daySources.historical.sources ||
              [],

            historical_focus:
              daySources.historical.historical_focus ||
              [],

            use:
              daySources.historical.use ||
              "",

            note:
              daySources.historical.note ||
              ""
          }
        : null,

    legal:
      daySources.legal
        ? {
            legal_sources:
              daySources.legal.legal_sources ||
              [],

            articles:
              daySources.legal.articles ||
              [],

            parts:
              daySources.legal.parts ||
              [],

            references:
              daySources.legal.references ||
              [],

            coverage:
              daySources.legal.coverage ||
              "",

            note:
              daySources.legal.note ||
              ""
          }
        : null,

    judicial:
      daySources.judicial
        ? {
            status:
              daySources.judicial.status ||
              null,

            doctrines:
              daySources.judicial.doctrines ||
              [],

            cases:
              daySources.judicial.cases ||
              [],

            references:
              daySources.judicial.references ||
              [],

            use:
              daySources.judicial.use ||
              ""
          }
        : null,

    official:
      daySources.official
        ? {
            sources:
              daySources.official.sources ||
              [],

            references:
              daySources.official.references ||
              [],

            use:
              daySources.official.use ||
              ""
          }
        : null
  };
}


const SOURCE_CONTEXT =
  buildSourceContext();


/* ==========================================================================
   AI PROMPT
========================================================================== */

const prompt = `

You are creating Day ${DAY} of CONSTITUTION 365.

CONSTITUTION 365 is a premium Telugu constitutional education program for ordinary people, students, workers, parents, professionals and senior citizens.

The objective is to make the Constitution of India understandable, accurate, practical and memorable.

This is not exam coaching.

This is not a coaching-centre answer sheet.

Write as an excellent Telugu constitutional educator.

Use natural, modern, grammatically correct Telugu.

Do not translate English sentence-by-sentence.

Explain ideas naturally in Telugu.

--------------------------------------------------
TODAY'S SYLLABUS
--------------------------------------------------

Day: ${syllabusEntry.day}

Title:
${syllabusEntry.title}

Stage:
${syllabusEntry.stage}

Focus:
${syllabusEntry.focus}


--------------------------------------------------
AUTHORITATIVE SOURCE CONTEXT
--------------------------------------------------

${JSON.stringify(
  SOURCE_CONTEXT,
  null,
  2
)}


--------------------------------------------------
SOURCE HIERARCHY
--------------------------------------------------

1. The Constitution of India is the primary constitutional source.

2. Historical sources explain historical background.

3. Legal sources explain ordinary legislation and statutory frameworks.

4. Judicial sources explain judicial interpretation and constitutional doctrine.

5. Official sources explain current institutional information.


--------------------------------------------------
ABSOLUTE ACCURACY RULES
--------------------------------------------------

Use ONLY the supplied authoritative source context.

Do NOT invent:

- constitutional Articles
- Parts
- Schedules
- constitutional powers
- constitutional procedures
- constitutional institutions
- historical facts
- historical dates
- historical quotations
- Acts
- sections
- statutory procedures
- statutory penalties
- statutory authorities
- legal rights
- court cases
- case citations
- judgment dates
- bench details
- judicial holdings
- judicial quotations

Do NOT present judicial interpretation as constitutional text.

Do NOT present ordinary legislation as constitutional text.

Do NOT present historical claims as constitutional provisions.

Do NOT present official institutional information as constitutional text.

Do NOT silently fill source gaps with general knowledge.

If a point is not supported by the supplied source context, do not introduce it.

Do not add legal details merely to make the lesson appear more sophisticated.

If the Constitution itself is sufficient for a point, explain the constitutional position directly.

Where legislation is supplied, clearly distinguish:
constitutional foundation
from
statutory framework.

Where judicial material is supplied, clearly distinguish:
constitutional text
from
judicial interpretation.

Where historical material is supplied, clearly distinguish:
historical background
from
constitutional text.


--------------------------------------------------
LESSON
--------------------------------------------------

Create one complete lesson about THIS day's topic only.

Explain the central idea deeply but simply.

Start naturally.

Use realistic everyday situations where genuinely useful.

Do not use artificial drama.

Do not create fictional constitutional facts.

Give practical examples.

Connect the subject to ordinary citizens.

Explain:

- what the idea means
- why it matters
- how it relates to ordinary citizens
- common misunderstandings
- what the authoritative sources actually establish

Avoid unnecessary legal jargon.

Whenever a legal term is necessary, explain it immediately in simple Telugu.

Do not turn the lesson into exam notes.

Do not repeat the title as filler.


--------------------------------------------------
DO NOT MENTION
--------------------------------------------------

Do not mention:

- this prompt
- AI
- Groq
- syllabus
- generation
- source validation
- internal files
- source registries
- internal implementation


--------------------------------------------------
MCQs
--------------------------------------------------

Create exactly 5 high-quality MCQs.

Each MCQ must have exactly 4 options.

Each MCQ must have exactly ONE correct answer.

MCQs must be based strictly on the lesson and supplied authoritative sources.

Test:

- understanding
- practical application
- everyday situations
- misconception checking

Do not introduce unsupported facts merely to make a question difficult.

Each answer explanation must clearly explain WHY the selected answer is correct.


--------------------------------------------------
STRICT TELUGU OUTPUT RULE
--------------------------------------------------

This is an ABSOLUTE output requirement.

The learner-facing final JSON content MUST be in natural Telugu.

The following fields MUST contain Telugu text and MUST contain ZERO English alphabet letters:

- title
- stage
- focus
- lesson
- examples
- why_it_matters
- common_misunderstanding
- mcqs.question
- mcqs.options
- mcqs.answer
- mcqs.explanation
- reflection

Do NOT use English alphabet characters A-Z or a-z
inside any of those fields.

Do NOT use English words.

Do NOT use English abbreviations.

Do NOT use English transliteration.

Do NOT mix English words into Telugu sentences.

Do NOT write English technical terms in the Telugu learner content.

If a concept normally has an English name, explain it naturally in Telugu instead.

Use Telugu script naturally and correctly.

Numbers may be used where genuinely necessary.

Normal punctuation may be used.

The JSON property names are fixed technical fields and are NOT learner-facing content.

The constitutional_reference and source_metadata objects are authoritative metadata and are NOT learner-facing prose.

Before returning the JSON, internally verify that every learner-facing field contains no English alphabet characters.


--------------------------------------------------
OUTPUT
--------------------------------------------------

Return ONLY valid JSON.

No Markdown fences.

No comments.

No trailing commas.

Use exactly this structure:

{
  "day": ${DAY},
  "title": "",
  "stage": "",
  "focus": "",
  "lesson": "",
  "examples": [],
  "why_it_matters": "",
  "common_misunderstanding": "",
  "mcqs": [
    {
      "question": "",
      "options": ["", "", "", ""],
      "answer": "",
      "explanation": ""
    }
  ],
  "constitutional_reference": {
    "articles": [],
    "parts": [],
    "references": []
  },
  "reflection": ""
}


--------------------------------------------------
IMPORTANT
--------------------------------------------------

The constitutional_reference values must reproduce the supplied constitutional source exactly.

Do not alter:

- articles
- parts
- references

The examples array must contain multiple useful examples.

The reflection must be one meaningful real-life question.

Ensure valid JSON escaping.

No trailing commas.

`;


/* ==========================================================================
   GROQ CALL
========================================================================== */

async function callGroq() {
  const key =
    process.env.GROQ_API_KEY;

  if (!key) {
    throw new Error(
      "GROQ_API_KEY is missing"
    );
  }

  let lastError;

  for (
    let attempt = 1;
    attempt <= 4;
    attempt++
  ) {
    try {
      console.log(
        `Generation attempt ${attempt}/4`
      );

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
                  0.35,

                reasoning_effort:
                  "high",

                max_completion_tokens:
                  16000,

                response_format: {
                  type: "json_object"
                },

                messages: [
                  {
                    role: "system",

                    content:
                      "You are an exceptionally careful constitutional educator and Telugu editor. Return only valid JSON. All learner-facing content must be natural Telugu with zero English alphabet characters. Never invent unsupported constitutional, legal, historical or judicial facts."
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

        let detail =
          body;

        try {
          const parsed =
            JSON.parse(body);

          detail =
            parsed?.error?.message ||
            body;

          if (
            parsed?.error?.failed_generation
          ) {
            detail +=
              ` | failed_generation: ${parsed.error.failed_generation}`;
          }
        } catch (_) {
          /* Keep raw response */
        }

        throw new Error(
          `Groq HTTP ${response.status}: ${detail}`
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
      } catch (parseError) {
        throw new Error(
          `Groq returned invalid JSON: ${parseError.message}`
        );
      }

    } catch (error) {
      lastError =
        error;

      console.error(
        `Attempt ${attempt} failed: ${error.message}`
      );

      if (
        attempt < 4
      ) {
        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              2500 * attempt
            )
        );
      }
    }
  }

  throw lastError;
}


/* ==========================================================================
   TELUGU CONTENT VALIDATION
========================================================================== */

function containsTelugu(value) {
  return (
    typeof value === "string" &&
    /[\u0C00-\u0C7F]/.test(value)
  );
}


function findEnglishLetters(value) {
  if (
    typeof value !== "string"
  ) {
    return [];
  }

  return [
    ...new Set(
      value.match(
        /[A-Za-z]/g
      ) || []
    )
  ];
}


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
  }

  if (
    !containsTelugu(value)
  ) {
    errors.push(
      `${fieldName} must contain Telugu text`
    );
  }

  const englishLetters =
    findEnglishLetters(
      value
    );

  if (
    englishLetters.length > 0
  ) {
    errors.push(
      `${fieldName} contains English letters: ${englishLetters.join(", ")}`
    );
  }

  if (
    value.includes("\uFFFD")
  ) {
    errors.push(
      `${fieldName} contains Unicode replacement character`
    );
  }

  if (
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(
      value
    )
  ) {
    errors.push(
      `${fieldName} contains invalid control characters`
    );
  }

  if (
    /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069]/.test(
      value
    )
  ) {
    errors.push(
      `${fieldName} contains unsupported invisible Unicode characters`
    );
  }

  return errors;
}


function validateTeluguContent(x) {
  const errors = [];

  const textFields = [
    "title",
    "stage",
    "focus",
    "lesson",
    "why_it_matters",
    "common_misunderstanding",
    "reflection"
  ];

  for (
    const field
    of textFields
  ) {
    errors.push(
      ...validateTeluguString(
        x[field],
        field
      )
    );
  }


  /* ---------------------------------------------------------------
     Examples
  ---------------------------------------------------------------- */

  if (
    !Array.isArray(x.examples)
  ) {
    errors.push(
      "examples must be an array"
    );
  } else {
    x.examples.forEach(
      (example, index) => {
        errors.push(
          ...validateTeluguString(
            example,
            `Example ${index + 1}`
          )
        );
      }
    );
  }


  /* ---------------------------------------------------------------
     MCQs
  ---------------------------------------------------------------- */

  if (
    !Array.isArray(x.mcqs)
  ) {
    errors.push(
      "mcqs must be an array"
    );

    return errors;
  }

  x.mcqs.forEach(
    (mcq, index) => {

      if (
        !mcq ||
        typeof mcq !== "object"
      ) {
        errors.push(
          `MCQ ${index + 1} must be an object`
        );

        return;
      }

      errors.push(
        ...validateTeluguString(
          mcq.question,
          `MCQ ${index + 1} question`
        )
      );


      if (
        !Array.isArray(
          mcq.options
        )
      ) {
        errors.push(
          `MCQ ${index + 1} options must be an array`
        );
      } else {
        mcq.options.forEach(
          (option, optionIndex) => {
            errors.push(
              ...validateTeluguString(
                option,
                `MCQ ${index + 1} option ${optionIndex + 1}`
              )
            );
          }
        );
      }


      errors.push(
        ...validateTeluguString(
          mcq.answer,
          `MCQ ${index + 1} answer`
        )
      );


      errors.push(
        ...validateTeluguString(
          mcq.explanation,
          `MCQ ${index + 1} explanation`
        )
      );
    }
  );

  return errors;
}


/* ==========================================================================
   GENERATED CONTENT VALIDATION
========================================================================== */

function validateGeneratedContent(x) {
  if (
    !x ||
    typeof x !== "object"
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

  if (
    typeof x.title !== "string" ||
    typeof x.stage !== "string" ||
    typeof x.focus !== "string"
  ) {
    throw new Error(
      "Missing basic fields"
    );
  }

  if (
    typeof x.lesson !== "string" ||
    x.lesson.trim().length < 500
  ) {
    throw new Error(
      "Lesson is too short"
    );
  }

  if (
    !Array.isArray(x.examples) ||
    x.examples.length < 2
  ) {
    throw new Error(
      "At least 2 examples required"
    );
  }

  for (
    const [index, example]
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
  }

  if (
    typeof x.why_it_matters !== "string" ||
    x.why_it_matters.trim().length < 100
  ) {
    throw new Error(
      "why_it_matters is too short"
    );
  }

  if (
    typeof x.common_misunderstanding !== "string" ||
    x.common_misunderstanding.trim().length < 50
  ) {
    throw new Error(
      "common_misunderstanding is too short"
    );
  }

  if (
    !Array.isArray(x.mcqs) ||
    x.mcqs.length !== 5
  ) {
    throw new Error(
      "Exactly 5 MCQs required"
    );
  }

  x.mcqs.forEach(
    (mcq, index) => {
      if (
        !mcq ||
        typeof mcq.question !== "string" ||
        !Array.isArray(mcq.options) ||
        mcq.options.length !== 4 ||
        typeof mcq.answer !== "string" ||
        typeof mcq.explanation !== "string"
      ) {
        throw new Error(
          `Invalid MCQ ${index + 1}`
        );
      }

      const options =
        mcq.options.map(
          option =>
            String(option).trim()
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
          `MCQ ${index + 1}: empty option`
        );
      }

      if (
        new Set(options).size !== 4
      ) {
        throw new Error(
          `MCQ ${index + 1}: options must be unique`
        );
      }

      if (
        !options.includes(answer)
      ) {
        throw new Error(
          `MCQ ${index + 1}: answer is not one of the options`
        );
      }

      if (
        mcq.question.trim().length < 10
      ) {
        throw new Error(
          `MCQ ${index + 1}: question is too short`
        );
      }

      if (
        mcq.explanation.trim().length < 20
      ) {
        throw new Error(
          `MCQ ${index + 1}: explanation is too short`
        );
      }
    }
  );

  if (
    !x.constitutional_reference ||
    typeof x.constitutional_reference !==
      "object"
  ) {
    throw new Error(
      "Missing constitutional_reference"
    );
  }

  if (
    !Array.isArray(
      x.constitutional_reference.articles
    ) ||
    !Array.isArray(
      x.constitutional_reference.parts
    ) ||
    !Array.isArray(
      x.constitutional_reference.references
    )
  ) {
    throw new Error(
      "Invalid constitutional_reference structure"
    );
  }

  if (
    typeof x.reflection !== "string" ||
    x.reflection.trim().length < 20
  ) {
    throw new Error(
      "Reflection is missing or too short"
    );
  }

  const teluguErrors =
    validateTeluguContent(x);

  if (
    teluguErrors.length > 0
  ) {
    throw new Error(
      teluguErrors.join("; ")
    );
  }

  return x;
}


/* ==========================================================================
   RESTORE AUTHORITATIVE FIELDS
========================================================================== */

function restoreAuthoritativeFields(
  generated
) {
  /*
   * IMPORTANT:
   *
   * Do NOT overwrite title, stage or focus
   * with syllabus values.
   *
   * The syllabus is the internal authoritative
   * generation instruction. The final learner-facing
   * values must remain the Telugu values generated
   * by the AI and validated above.
   */

  generated.day =
    DAY;

  /*
   * Constitutional references are authoritative
   * metadata and must come directly from the
   * constitutional source.
   */

  generated.constitutional_reference = {
    articles:
      constitutionalEntry.articles ||
      [],

    parts:
      constitutionalEntry.parts ||
      [],

    references:
      constitutionalEntry.references ||
      []
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
        ? daySources.legal.legal_sources
        : [],

    historical_source_ids:
      daySources.historical &&
      Array.isArray(
        daySources.historical.sources
      )
        ? daySources.historical.sources
        : [],

    judicial_doctrines:
      daySources.judicial &&
      Array.isArray(
        daySources.judicial.doctrines
      )
        ? daySources.judicial.doctrines
        : [],

    judicial_cases:
      daySources.judicial &&
      Array.isArray(
        daySources.judicial.cases
      )
        ? daySources.judicial.cases
        : [],

    official_source_ids:
      daySources.official &&
      Array.isArray(
        daySources.official.sources
      )
        ? daySources.official.sources
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
  if (
    Number(output.day) !== DAY
  ) {
    throw new Error(
      "Final output day mismatch"
    );
  }

  /*
   * IMPORTANT:
   *
   * Do NOT compare title/stage/focus against
   * the syllabus text here.
   *
   * The syllabus may use English/internal
   * terminology while the final learner-facing
   * JSON must be Telugu.
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
    !output.source_metadata ||
    !Array.isArray(
      output.source_metadata.source_layers
    )
  ) {
    throw new Error(
      "Missing final source metadata"
    );
  }


  const finalLayers =
    output
      .source_metadata
      .source_layers;

  if (
    JSON.stringify(
      finalLayers
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
    !Array.isArray(output.mcqs) ||
    output.mcqs.length !== 5
  ) {
    throw new Error(
      "Final output must contain exactly 5 MCQs"
    );
  }


  /*
   * Final Telugu validation is performed AFTER
   * authoritative fields are restored.
   *
   * This ensures the actual file written to disk
   * passes the same Telugu rules.
   */

  const finalTeluguErrors =
    validateTeluguContent(
      output
    );

  if (
    finalTeluguErrors.length > 0
  ) {
    throw new Error(
      finalTeluguErrors.join("; ")
    );
  }
}


/* ==========================================================================
   GENERATION
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
    "Strict Telugu-only learner output enabled."
  );

  console.log(
    "English-letter rejection enabled."
  );

  console.log(
    "Strict constitutional accuracy rules enabled."
  );

  console.log(
    "Calling Groq..."
  );


  const generated =
    validateGeneratedContent(
      await callGroq()
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
   * Only write the production file AFTER
   * every validation has passed.
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
   * Re-read the actual production file and
   * validate the bytes that were written.
   */

  const written =
    JSON.parse(
      fs.readFileSync(
        output,
        "utf8"
      )
    );


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
    "Final JSON re-read validation: PASSED"
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
