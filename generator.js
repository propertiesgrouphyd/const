const fs=require("fs");
const path=require("path");

const DAY=Number(process.env.DAY||0);
const VALIDATE_ONLY=process.argv.includes("--validate");

const ROOT=process.cwd();
const DATA=path.join(ROOT,"data");

const FILES={
  syllabus:"syllabus.json",
  sourceMap:"source-map.json",
  constitutional:"constitutional-sources.json",
  historical:"historical-sources.json",
  legal:"legal-sources.json",
  judicial:"judicial-sources.json",
  official:"official-sources.json"
};

const ALLOWED_CONSTITUTIONAL_TYPES=new Set([
  "constitutional",
  "conceptual",
  "historical",
  "statutory",
  "judicial",
  "mixed"
]);

const ALLOWED_SOURCE_LAYERS=new Set([
  "constitutional",
  "historical",
  "legal",
  "judicial",
  "official"
]);

const REQUIRED_TEXT_FIELDS=[
  "title",
  "stage",
  "focus",
  "lesson",
  "why_it_matters",
  "common_misunderstanding",
  "reflection"
];

const MAX_GENERATION_ATTEMPTS=4;


/* ==========================================================================
   LOAD JSON
========================================================================== */

function loadJson(fileName){
  const filePath=path.join(DATA,fileName);

  if(!fs.existsSync(filePath)){
    throw new Error(
      `Required source file not found: data/${fileName}`
    );
  }

  try{
    return JSON.parse(
      fs.readFileSync(filePath,"utf8")
    );
  }catch(error){
    throw new Error(
      `Invalid JSON in data/${fileName}: ${error.message}`
    );
  }
}


/* ==========================================================================
   DAY VALIDATION
========================================================================== */

if(
  !Number.isInteger(DAY)||
  DAY<1||
  DAY>365
){
  throw new Error(
    "DAY must be an integer between 1 and 365"
  );
}


/* ==========================================================================
   LOAD AUTHORITATIVE SOURCES
========================================================================== */

const SYLLABUS=loadJson(FILES.syllabus);
const SOURCE_MAP=loadJson(FILES.sourceMap);
const CONSTITUTIONAL=loadJson(FILES.constitutional);
const HISTORICAL=loadJson(FILES.historical);
const LEGAL=loadJson(FILES.legal);
const JUDICIAL=loadJson(FILES.judicial);
const OFFICIAL=loadJson(FILES.official);


/* ==========================================================================
   BASIC STRUCTURE VALIDATION
========================================================================== */

if(!Array.isArray(SYLLABUS)){
  throw new Error(
    "syllabus.json must contain an array"
  );
}

if(SYLLABUS.length!==365){
  throw new Error(
    `syllabus.json must contain exactly 365 entries; found ${SYLLABUS.length}`
  );
}

if(
  !CONSTITUTIONAL||
  typeof CONSTITUTIONAL!=="object"||
  Array.isArray(CONSTITUTIONAL)||
  !CONSTITUTIONAL.days||
  typeof CONSTITUTIONAL.days!=="object"||
  Array.isArray(CONSTITUTIONAL.days)
){
  throw new Error(
    "constitutional-sources.json must contain a days object"
  );
}

if(
  !SOURCE_MAP||
  typeof SOURCE_MAP!=="object"||
  Array.isArray(SOURCE_MAP)
){
  throw new Error(
    "source-map.json must contain an object"
  );
}


/* ==========================================================================
   FIND DAY
========================================================================== */

const syllabusEntry=
  SYLLABUS.find(
    item=>Number(item?.day)===DAY
  );

if(!syllabusEntry){
  throw new Error(
    `Syllabus entry not found for day ${DAY}`
  );
}

const constitutionalEntry=
  CONSTITUTIONAL.days[String(DAY)];

if(!constitutionalEntry){
  throw new Error(
    `Constitutional source not found for day ${DAY}`
  );
}


/* ==========================================================================
   HELPERS
========================================================================== */

function getDaySource(container,day){
  if(
    !container||
    typeof container!=="object"||
    !container.days||
    typeof container.days!=="object"||
    Array.isArray(container.days)
  ){
    return null;
  }

  return container.days[String(day)]||null;
}

function getSourceType(entry){
  return String(
    entry?.source_type||""
  ).trim().toLowerCase();
}

function unique(values){
  return[
    ...new Set(
      values
        .filter(
          value=>
            value!==undefined&&
            value!==null&&
            String(value).trim()!==""
        )
        .map(String)
    )
  ];
}

function isPlainObject(value){
  return(
    value!==null&&
    typeof value==="object"&&
    !Array.isArray(value)
  );
}


/* ==========================================================================
   DAY SOURCE ENTRIES
========================================================================== */

const daySources={
  constitutional:constitutionalEntry,
  historical:getDaySource(HISTORICAL,DAY),
  legal:getDaySource(LEGAL,DAY),
  judicial:getDaySource(JUDICIAL,DAY),
  official:getDaySource(OFFICIAL,DAY)
};


/* ==========================================================================
   SOURCE MAP VALIDATION
========================================================================== */

function validateSourceMap(){
  const errors=[];

  const expectedFiles={
    constitutional:FILES.constitutional,
    historical:FILES.historical,
    legal:FILES.legal,
    judicial:FILES.judicial,
    official:FILES.official
  };

  if(
    !SOURCE_MAP.source_files||
    typeof SOURCE_MAP.source_files!=="object"||
    Array.isArray(SOURCE_MAP.source_files)
  ){
    errors.push(
      "source-map.json is missing source_files"
    );
  }else{
    for(
      const[layer,fileName]
      of Object.entries(expectedFiles)
    ){
      if(
        SOURCE_MAP.source_files[layer]!==fileName
      ){
        errors.push(
          `source-map.json source_files.${layer} must be "${fileName}"`
        );
      }
    }
  }

  if(
    !SOURCE_MAP.validation||
    typeof SOURCE_MAP.validation!=="object"
  ){
    errors.push(
      "source-map.json is missing validation"
    );
  }else if(
    !Array.isArray(
      SOURCE_MAP.validation.allowed_source_types
    )
  ){
    errors.push(
      "source-map.json is missing validation.allowed_source_types"
    );
  }else{
    for(
      const type
      of SOURCE_MAP.validation.allowed_source_types
    ){
      if(!ALLOWED_SOURCE_LAYERS.has(type)){
        errors.push(
          `source-map.json contains unsupported source type "${type}"`
        );
      }
    }
  }

  if(
    SOURCE_MAP.day_map!==undefined&&
    (
      SOURCE_MAP.day_map===null||
      typeof SOURCE_MAP.day_map!=="object"||
      Array.isArray(SOURCE_MAP.day_map)
    )
  ){
    errors.push(
      "source-map.json day_map must be an object"
    );
  }

  return errors;
}


/* ==========================================================================
   REQUIRED SOURCE ROUTING
========================================================================== */

function determineRequiredLayers(){
  const layers=["constitutional"];

  const constitutionalType=
    getSourceType(constitutionalEntry);

  const additional=
    Array.isArray(
      constitutionalEntry.additional_sources
    )
      ?constitutionalEntry.additional_sources
      :[];

  if(
    constitutionalType==="historical"||
    additional.includes("historical-sources.json")||
    daySources.historical
  ){
    layers.push("historical");
  }

  if(
    constitutionalType==="statutory"||
    additional.includes("legal-sources.json")||
    daySources.legal
  ){
    layers.push("legal");
  }

  if(
    constitutionalType==="judicial"||
    additional.includes("judicial-sources.json")||
    daySources.judicial
  ){
    layers.push("judicial");
  }

  if(
    additional.includes("official-sources.json")||
    daySources.official
  ){
    layers.push("official");
  }

  return unique(layers);
}

const requiredLayers=
  determineRequiredLayers();


/* ==========================================================================
   SYLLABUS VALIDATION
========================================================================== */

function validateSyllabus(){
  const errors=[];

  const allDays=
    SYLLABUS.map(
      item=>Number(item?.day)
    );

  const uniqueDays=
    new Set(allDays);

  if(uniqueDays.size!==365){
    errors.push(
      "syllabus.json contains duplicate day numbers"
    );
  }

  for(let day=1;day<=365;day++){
    if(!uniqueDays.has(day)){
      errors.push(
        `syllabus.json is missing day ${day}`
      );
    }
  }

  if(Number(syllabusEntry.day)!==DAY){
    errors.push(
      `Day ${DAY}: syllabus day mismatch`
    );
  }

  for(
    const field
    of["title","stage","focus"]
  ){
    if(
      typeof syllabusEntry[field]!=="string"||
      syllabusEntry[field].trim()===""
    ){
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

function validateConstitutionalSource(){
  const errors=[];
  const entry=daySources.constitutional;

  if(!entry){
    errors.push(
      `Day ${DAY}: constitutional source missing`
    );
    return errors;
  }

  if(!isPlainObject(entry)){
    errors.push(
      `Day ${DAY}: constitutional source must be an object`
    );
    return errors;
  }

  const sourceType=
    getSourceType(entry);

  if(
    !ALLOWED_CONSTITUTIONAL_TYPES.has(
      sourceType
    )
  ){
    errors.push(
      `Day ${DAY}: unsupported source_type "${sourceType}"`
    );
  }

  for(
    const field
    of["articles","parts","references"]
  ){
    if(!Array.isArray(entry[field])){
      errors.push(
        `Day ${DAY}: constitutional ${field} must be an array`
      );
    }
  }

  if(
    entry.additional_sources!==undefined&&
    !Array.isArray(entry.additional_sources)
  ){
    errors.push(
      `Day ${DAY}: additional_sources must be an array`
    );
  }

  if(
    Array.isArray(entry.additional_sources)
  ){
    const allowedAdditional=new Set([
      "historical-sources.json",
      "legal-sources.json",
      "judicial-sources.json",
      "official-sources.json"
    ]);

    for(
      const sourceFile
      of entry.additional_sources
    ){
      if(!allowedAdditional.has(sourceFile)){
        errors.push(
          `Day ${DAY}: unsupported additional source "${sourceFile}"`
        );
      }
    }
  }

  return errors;
}


/* ==========================================================================
   REQUIRED SOURCE VALIDATION
========================================================================== */

function validateRequiredSources(){
  const errors=[];

  for(
    const layer
    of requiredLayers
  ){
    if(!daySources[layer]){
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

function validateLegalSources(){
  const errors=[];
  const entry=daySources.legal;

  if(!entry)return errors;

  if(!isPlainObject(entry)){
    errors.push(
      `Day ${DAY}: legal source entry must be an object`
    );
    return errors;
  }

  if(
    String(entry.status||"")
      .trim()
      .toLowerCase()==="unresolved"
  ){
    errors.push(
      `Day ${DAY}: legal source entry is explicitly unresolved`
    );
  }

  if(!Array.isArray(entry.legal_sources)){
    errors.push(
      `Day ${DAY}: legal_sources must be an array`
    );
    return errors;
  }

  const registry=
    Array.isArray(LEGAL.primary_legal_sources)
      ?LEGAL.primary_legal_sources
      :[];

  const validIds=
    new Set(
      registry
        .map(
          source=>source&&source.id
        )
        .filter(Boolean)
    );

  const declared=
    unique(entry.legal_sources);

  if(declared.length===0){
    errors.push(
      `Day ${DAY}: legal source entry contains no resolved legal source`
    );
  }

  for(
    const sourceId
    of declared
  ){
    if(!validIds.has(sourceId)){
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

function validateHistoricalSources(){
  const errors=[];
  const entry=daySources.historical;

  if(!entry)return errors;

  if(!isPlainObject(entry)){
    errors.push(
      `Day ${DAY}: historical source entry must be an object`
    );
    return errors;
  }

  if(
    String(entry.status||"")
      .trim()
      .toLowerCase()==="unresolved"
  ){
    errors.push(
      `Day ${DAY}: historical source entry is unresolved`
    );
  }

  if(!Array.isArray(entry.sources)){
    errors.push(
      `Day ${DAY}: historical sources must be an array`
    );
    return errors;
  }

  const registry=
    Array.isArray(
      HISTORICAL.primary_historical_sources
    )
      ?HISTORICAL.primary_historical_sources
      :[];

  const validIds=
    new Set(
      registry
        .map(
          source=>source&&source.id
        )
        .filter(Boolean)
    );

  const declared=
    unique(entry.sources);

  if(declared.length===0){
    errors.push(
      `Day ${DAY}: historical source entry contains no resolved source`
    );
  }

  for(
    const sourceId
    of declared
  ){
    if(!validIds.has(sourceId)){
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

function validateJudicialSources(){
  const errors=[];
  const entry=daySources.judicial;

  if(!entry)return errors;

  if(!isPlainObject(entry)){
    errors.push(
      `Day ${DAY}: judicial source entry must be an object`
    );
    return errors;
  }

  const caseRegistry=
    isPlainObject(JUDICIAL.case_registry)
      ?JUDICIAL.case_registry
      :{};

  const doctrineRegistry=
    isPlainObject(JUDICIAL.doctrine_registry)
      ?JUDICIAL.doctrine_registry
      :{};

  if(
    String(entry.status||"")
      .trim()
      .toLowerCase()==="unresolved"
  ){
    errors.push(
      `Day ${DAY}: judicial source is unresolved`
    );
  }

  const doctrines=
    Array.isArray(entry.doctrines)
      ?unique(entry.doctrines)
      :[];

  const cases=
    Array.isArray(entry.cases)
      ?unique(entry.cases)
      :[];

  if(
    doctrines.length===0&&
    cases.length===0
  ){
    errors.push(
      `Day ${DAY}: judicial source must declare at least one verified doctrine or case`
    );
    return errors;
  }

  for(
    const doctrineId
    of doctrines
  ){
    const doctrine=
      doctrineRegistry[doctrineId];

    if(!doctrine){
      errors.push(
        `Day ${DAY}: unresolved judicial doctrine "${doctrineId}"`
      );
      continue;
    }

    if(
      String(doctrine.status||"")
        .trim()
        .toLowerCase()==="requires_verified_case_sources"
    ){
      errors.push(
        `Day ${DAY}: doctrine "${doctrineId}" requires verified case sources`
      );
    }

    const caseSources=
      Array.isArray(doctrine.case_sources)
        ?unique(doctrine.case_sources)
        :[];

    if(caseSources.length===0){
      errors.push(
        `Day ${DAY}: doctrine "${doctrineId}" has no verified case sources`
      );
    }

    for(
      const caseId
      of caseSources
    ){
      if(!caseRegistry[caseId]){
        errors.push(
          `Day ${DAY}: doctrine "${doctrineId}" references missing case "${caseId}"`
        );
      }
    }
  }

  for(
    const caseId
    of cases
  ){
    if(!caseRegistry[caseId]){
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

function validateOfficialSources(){
  const errors=[];
  const entry=daySources.official;

  if(!entry)return errors;

  if(!isPlainObject(entry)){
    errors.push(
      `Day ${DAY}: official source entry must be an object`
    );
    return errors;
  }

  if(
    String(entry.status||"")
      .trim()
      .toLowerCase()==="unresolved"
  ){
    errors.push(
      `Day ${DAY}: official source entry is unresolved`
    );
  }

  if(!Array.isArray(entry.sources)){
    errors.push(
      `Day ${DAY}: official sources must be an array`
    );
    return errors;
  }

  const registry=
    isPlainObject(
      OFFICIAL.institution_registry
    )
      ?OFFICIAL.institution_registry
      :{};

  const declared=
    unique(entry.sources);

  if(declared.length===0){
    errors.push(
      `Day ${DAY}: official source entry contains no resolved source`
    );
  }

  for(
    const sourceId
    of declared
  ){
    if(!registry[sourceId]){
      errors.push(
        `Day ${DAY}: unresolved official source "${sourceId}"`
      );
    }
  }

  return errors;
}


/* ==========================================================================
   SOURCE-MAP DAY ROUTING VALIDATION
========================================================================== */

function validateDayRouting(){
  const errors=[];

  const dayMap=
    SOURCE_MAP.day_map&&
    typeof SOURCE_MAP.day_map==="object"&&
    !Array.isArray(SOURCE_MAP.day_map)
      ?SOURCE_MAP.day_map
      :{};

  const explicit=
    dayMap[String(DAY)];

  if(!explicit)return errors;

  if(!isPlainObject(explicit)){
    errors.push(
      `Day ${DAY}: source-map day entry must be an object`
    );
    return errors;
  }

  if(!Array.isArray(explicit.sources)){
    errors.push(
      `Day ${DAY}: source-map day entry must contain a sources array`
    );
    return errors;
  }

  const declaredLayers=
    unique(explicit.sources);

  for(
    const layer
    of declaredLayers
  ){
    if(!ALLOWED_SOURCE_LAYERS.has(layer)){
      errors.push(
        `Day ${DAY}: source-map contains unsupported source layer "${layer}"`
      );
    }
  }

  for(
    const layer
    of declaredLayers
  ){
    if(!requiredLayers.includes(layer)){
      errors.push(
        `Day ${DAY}: source-map declares "${layer}" but authoritative routing does not require it`
      );
    }
  }

  for(
    const layer
    of requiredLayers
  ){
    if(!declaredLayers.includes(layer)){
      errors.push(
        `Day ${DAY}: authoritative routing requires "${layer}" but source-map does not declare it`
      );
    }
  }

  return errors;
}


/* ==========================================================================
   RUN SOURCE VALIDATION
========================================================================== */

const validationErrors=[
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

if(validationErrors.length>0){
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

  for(
    const error
    of validationErrors
  ){
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
   VALIDATION ONLY
========================================================================== */

if(VALIDATE_ONLY){
  console.log("");
  console.log(
    "=========================================="
  );
  console.log(
    "CONSTITUTION 365 SOURCE VALIDATION"
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
  console.log("");
  console.log(
    "All authoritative source validations passed."
  );
  console.log(
    "No AI generation was performed."
  );
  console.log(
    "=========================================="
  );
  process.exit(0);
}


/* ==========================================================================
   SOURCE CONTEXT
========================================================================== */

function buildSourceContext(){
  return{
    constitutional:{
      source_type:
        constitutionalEntry.source_type||null,

      articles:
        constitutionalEntry.articles||[],

      parts:
        constitutionalEntry.parts||[],

      references:
        constitutionalEntry.references||[]
    },

    historical:
      daySources.historical
        ?{
            sources:
              daySources.historical.sources||[],

            historical_focus:
              daySources.historical.historical_focus||[],

            use:
              daySources.historical.use||"",

            note:
              daySources.historical.note||""
          }
        :null,

    legal:
      daySources.legal
        ?{
            legal_sources:
              daySources.legal.legal_sources||[],

            articles:
              daySources.legal.articles||[],

            parts:
              daySources.legal.parts||[],

            references:
              daySources.legal.references||[],

            coverage:
              daySources.legal.coverage||"",

            note:
              daySources.legal.note||""
          }
        :null,

    judicial:
      daySources.judicial
        ?{
            status:
              daySources.judicial.status||null,

            doctrines:
              daySources.judicial.doctrines||[],

            cases:
              daySources.judicial.cases||[],

            references:
              daySources.judicial.references||[],

            use:
              daySources.judicial.use||""
          }
        :null,

    official:
      daySources.official
        ?{
            sources:
              daySources.official.sources||[],

            references:
              daySources.official.references||[],

            use:
              daySources.official.use||""
          }
        :null
  };
}

const SOURCE_CONTEXT=
  buildSourceContext();


/* ==========================================================================
   PROMPT
========================================================================== */

const prompt=`

You are creating Day ${DAY} of CONSTITUTION 365.

This is a premium Telugu constitutional education program.

The purpose is to help ordinary citizens understand the Constitution of India accurately, practically and clearly.

This is NOT exam coaching.

This is NOT a generic law lesson.

This is NOT a place to add facts from your own knowledge.

You must stay strictly inside the supplied authoritative source context.

--------------------------------------------------
TODAY'S AUTHORITATIVE SYLLABUS
--------------------------------------------------

Day:
${syllabusEntry.day}

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
SOURCE DISCIPLINE
--------------------------------------------------

Treat the supplied sources as separate layers.

CONSTITUTIONAL:
The Constitution of India itself.

HISTORICAL:
Historical background only.

LEGAL:
Ordinary legislation and statutory frameworks.

JUDICIAL:
Court interpretation and constitutional doctrine.

OFFICIAL:
Official institutional information.

Never merge these categories.

Never describe a statute as though it is constitutional text.

Never describe a court judgment as though it is an Article of the Constitution.

Never describe historical background as though it is a constitutional provision.

Never describe an official institutional fact as though it is constitutional text.

--------------------------------------------------
ABSOLUTE FACTUAL ACCURACY
--------------------------------------------------

Use ONLY information supported by the supplied source context.

Do NOT invent or infer:

- Articles
- Parts
- Schedules
- constitutional powers
- constitutional procedures
- constitutional institutions
- statutory Acts
- statutory sections
- statutory penalties
- statutory authorities
- legal rights
- historical dates
- historical events
- historical quotations
- court cases
- case names
- citations
- judgment dates
- bench composition
- judicial holdings
- judicial quotations
- institutional facts

If a fact is not supported by the supplied sources, OMIT it.

Do not fill a source gap from general knowledge.

Do not make a statement merely because it sounds legally reasonable.

Do not add a legal claim merely to make the lesson more impressive.

When the source only supports a general constitutional principle, explain only that principle.

When the source does not establish a particular right, do not call it a constitutional right.

When the source does not establish a particular statutory rule, do not state that rule.

When judicial material is supplied, identify it as judicial interpretation.

When statutory material is supplied, identify it as statutory law.

--------------------------------------------------
VERY IMPORTANT LEGAL WRITING RULE
--------------------------------------------------

Do not make broad claims such as:

"the Constitution gives everyone a right to vote"

unless the supplied source specifically establishes that proposition.

Do not say:

"education, health and livelihood are all fundamental rights"

unless the supplied source specifically establishes each proposition.

Do not say:

"every unconstitutional law automatically becomes void"

unless the supplied source context specifically supports the exact formulation.

Do not convert constitutional values, Directive Principles,
fundamental rights, statutory rights, electoral rights,
or judicially interpreted principles into one undifferentiated category.

Use precise wording.

--------------------------------------------------
LESSON
--------------------------------------------------

Create one complete lesson ONLY about this day's syllabus topic.

The lesson must:

- explain the central idea clearly
- remain faithful to the authoritative sources
- use natural Telugu
- be understandable to ordinary citizens
- explain why the topic matters
- use realistic examples only when supported
- identify common misunderstandings
- distinguish constitutional text from other source layers

Do not use fictional legal situations that require unsupported legal conclusions.

Do not invent names, cases, dates or legal outcomes.

Do not turn the lesson into exam notes.

Do not repeat the title unnecessarily.

Do not use unnecessary legal jargon.

--------------------------------------------------
CONTENT LENGTH REQUIREMENTS
--------------------------------------------------

LESSON:
- At least 500 characters.
- At most 30000 characters.
- Complete, clear and educational.
- Do not repeat sentences to reach the minimum.

EXAMPLES:
- Provide between 3 and 8 examples.
- Every example must contain at least 20 characters.
- Every example must contain at most 2500 characters.
- Every example must be directly supported by the authoritative source context.

WHY IT MATTERS:
- At least 100 characters.

COMMON MISUNDERSTANDING:
- At least 50 characters.

REFLECTION:
- At least 20 characters.

Do not satisfy length requirements by repeating the same sentence.

--------------------------------------------------
MCQs
--------------------------------------------------

Create EXACTLY 5 MCQs.

Each MCQ must contain EXACTLY 4 unique options.

Exactly ONE option must be correct.

The answer must exactly match one option.

Every MCQ must be answerable from the supplied source context and lesson.

Do not use outside legal knowledge.

Do not make a question difficult by introducing an unsupported fact.

Test understanding rather than memorization.

Each explanation must explain why the selected option is correct.

--------------------------------------------------
MCQ QUALITY CONTROL
--------------------------------------------------

Before returning JSON, check every MCQ:

1. Is the question supported by the supplied sources?
2. Is there exactly one correct option?
3. Does the answer exactly match an option?
4. Are all four options unique?
5. Does the explanation support the selected answer?
6. Did the question accidentally introduce an unsupported Article, Act, case, right or procedure?

If any answer is NO, rewrite that MCQ before returning the JSON.

--------------------------------------------------
LANGUAGE
--------------------------------------------------

This is the Telugu edition of Vidhwaan Constitution 365.

All educational content must be natural Telugu using Telugu script.

This applies to:

- lesson
- examples
- why_it_matters
- common_misunderstanding
- MCQ questions
- MCQ options
- MCQ answers
- MCQ explanations
- reflection

Do NOT use English alphabet characters merely for convenience.

Do NOT use transliterated Telugu.

Do NOT randomly mix English words into Telugu sentences.

Use Telugu equivalents whenever available.

Do NOT use foreign writing systems.

Before returning JSON, inspect every generated field for language and script contamination.

--------------------------------------------------
DO NOT MENTION
--------------------------------------------------

Do not mention:

- AI
- Groq
- this prompt
- generation
- source validation
- source registry
- internal files
- internal implementation
- syllabus processing

--------------------------------------------------
AUTHORITATIVE FIELDS
--------------------------------------------------

The following values are authoritative and MUST NOT be creatively changed:

day:
${DAY}

title:
${syllabusEntry.title}

stage:
${syllabusEntry.stage}

focus:
${syllabusEntry.focus}

The application will restore these values after generation.

--------------------------------------------------
CONSTITUTIONAL REFERENCE
--------------------------------------------------

Return constitutional_reference with:

articles: []
parts: []
references: []

Do not invent constitutional references.

The application will restore the authoritative values.

--------------------------------------------------
JSON TEXT QUALITY
--------------------------------------------------

IMPORTANT:

Return normal human-readable Telugu text.

Do NOT use backslashes inside educational text.

Do NOT escape ordinary punctuation unnecessarily.

Do NOT write literal sequences such as:

\\
\\/
\\\\

Do not use programming-style escape sequences.

Use normal Telugu punctuation and sentences.

JSON itself will handle the required escaping.

Commas are normal JSON punctuation and must not be removed.

--------------------------------------------------
OUTPUT
--------------------------------------------------

Return ONLY one valid JSON object.

No Markdown.

No code fences.

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

The JSON must be syntactically valid.
`;


/* ==========================================================================
   GROQ CALL
========================================================================== */

async function callGroq(attempt){
  const key=
    process.env.GROQ_API_KEY;

  if(!key){
    throw new Error(
      "GROQ_API_KEY is missing"
    );
  }

  const model=
    process.env.GROQ_MODEL||
    "openai/gpt-oss-120b";

  const response=
    await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method:"POST",

        headers:{
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${key}`
        },

        body:JSON.stringify({
          model,

          temperature:0.20,

          reasoning_effort:"medium",

          max_completion_tokens:20000,

          response_format:{
            type:"json_object"
          },

          messages:[
            {
              role:"system",

              content:[
                "You are an exceptionally careful Telugu constitutional educator.",
                "Generate only the requested Constitution 365 lesson.",
                "Use ONLY the authoritative source context supplied by the application.",
                "Never invent constitutional, historical, statutory, judicial or institutional facts.",
                "Never invent Articles, Parts, Acts, sections, cases, dates, names, powers, procedures or legal outcomes.",
                "Never rely on outside legal knowledge.",
                "The application will perform independent factual validation after generation.",
                "All educational content must be natural Telugu using Telugu script.",
                "Do not use foreign writing systems.",
                "Do not randomly mix English into Telugu sentences.",
                "Do not place backslashes in educational text.",
                "Return ONLY the JSON object requested by the user."
              ].join("\n")
            },

            {
              role:"user",
              content:prompt
            }
          ]
        })
      }
    );

  if(!response.ok){
    const body=
      await response.text();

    let details=body;

    try{
      details=
        JSON.stringify(
          JSON.parse(body)
        );
    }catch(_){
      // Keep raw response.
    }

    const retryAfter=
      response.headers.get(
        "retry-after"
      );

    const suffix=
      retryAfter
        ?` Retry-After: ${retryAfter}`
        :"";

    throw new Error(
      `Groq HTTP ${response.status}: ${details}${suffix}`
    );
  }

  const json=
    await response.json();

  const message=
    json?.choices?.[0]?.message;

  if(!message){
    throw new Error(
      "Groq returned no message"
    );
  }

  if(message.refusal){
    throw new Error(
      `Groq refused generation: ${message.refusal}`
    );
  }

  const content=
    message.content;

  if(
    typeof content!=="string"||
    !content.trim()
  ){
    throw new Error(
      "Groq returned empty content"
    );
  }

  try{
    return sanitizeGeneratedContent(
      JSON.parse(content)
    );
  }catch(error){
    throw new Error(
      `Groq returned invalid JSON on attempt ${attempt}: ${error.message}`
    );
  }
}


/* ==========================================================================
   GENERATED TEXT CLEANING
========================================================================== */

function sanitizeGeneratedText(value){
  if(typeof value!=="string"){
    return value;
  }

  return value
    .normalize("NFC")

    /*
     * Remove Unicode replacement character.
     */
    .replace(/\uFFFD/g,"")

    /*
     * Remove literal backslashes from generated
     * educational text.
     */
    .replace(/\\/g,"")

    /*
     * Remove null/control characters.
     */
    .replace(/\u0000/g,"")
    .replace(
      /[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g,
      ""
    )

    .trim();
}


function sanitizeGeneratedContent(x){
  if(
    !x||
    typeof x!=="object"||
    Array.isArray(x)
  ){
    return x;
  }

  for(
    const field
    of[
      "title",
      "stage",
      "focus",
      "lesson",
      "why_it_matters",
      "common_misunderstanding",
      "reflection"
    ]
  ){
    if(
      typeof x[field]==="string"
    ){
      x[field]=
        sanitizeGeneratedText(
          x[field]
        );
    }
  }

  if(
    Array.isArray(x.examples)
  ){
    x.examples=
      x.examples.map(
        example=>
          sanitizeGeneratedText(
            example
          )
      );
  }

  if(
    Array.isArray(x.mcqs)
  ){
    x.mcqs=
      x.mcqs.map(
        mcq=>{
          if(
            !mcq||
            typeof mcq!=="object"||
            Array.isArray(mcq)
          ){
            return mcq;
          }

          for(
            const field
            of[
              "question",
              "answer",
              "explanation"
            ]
          ){
            if(
              typeof mcq[field]==="string"
            ){
              mcq[field]=
                sanitizeGeneratedText(
                  mcq[field]
                );
            }
          }

          if(
            Array.isArray(mcq.options)
          ){
            mcq.options=
              mcq.options.map(
                option=>
                  sanitizeGeneratedText(
                    option
                  )
              );
          }

          return mcq;
        }
      );
  }

  return x;
}


/* ==========================================================================
   FOREIGN SCRIPT VALIDATION
========================================================================== */

const FORBIDDEN_SCRIPT_RANGES=[
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

function findForbiddenScripts(value){
  if(typeof value!=="string"){
    return[];
  }

  const found=[];

  for(
    const pattern
    of FORBIDDEN_SCRIPT_RANGES
  ){
    if(pattern.test(value)){
      found.push(pattern.source);
    }
  }

  return found;
}

function containsTelugu(value){
  return(
    typeof value==="string"&&
    /[\u0C00-\u0C7F]/.test(value)
  );
}

function validateTeluguString(
  value,
  fieldName
){
  const errors=[];

  if(typeof value!=="string"){
    errors.push(
      `${fieldName} must be a string`
    );
    return errors;
  }

  if(value.trim()===""){
    errors.push(
      `${fieldName} must not be empty`
    );
    return errors;
  }

  if(!containsTelugu(value)){
    errors.push(
      `${fieldName} must contain Telugu text`
    );
  }

  if(
    findForbiddenScripts(value).length>0
  ){
    errors.push(
      `${fieldName} contains unsupported foreign-script characters`
    );
  }

  if(value.includes("\uFFFD")){
    errors.push(
      `${fieldName} contains Unicode replacement character`
    );
  }

  if(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(
      value
    )
  ){
    errors.push(
      `${fieldName} contains invalid control characters`
    );
  }

  if(value.includes("\\")){
    errors.push(
      `${fieldName} contains a backslash`
    );
  }

  return errors;
}


/* ==========================================================================
   TELUGU CONTENT VALIDATION
========================================================================== */

function validateTeluguContent(x){
  const errors=[];

  for(
    const field
    of REQUIRED_TEXT_FIELDS
  ){
    errors.push(
      ...validateTeluguString(
        x[field],
        field
      )
    );
  }

  if(!Array.isArray(x.examples)){
    errors.push(
      "examples must be an array"
    );
  }else{
    x.examples.forEach(
      (
        example,
        index
      )=>{
        errors.push(
          ...validateTeluguString(
            example,
            `Example ${index+1}`
          )
        );
      }
    );
  }

  if(!Array.isArray(x.mcqs)){
    return errors;
  }

  x.mcqs.forEach(
    (
      mcq,
      index
    )=>{
      const n=index+1;

      if(
        !mcq||
        typeof mcq!=="object"
      ){
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

      if(
        Array.isArray(mcq.options)
      ){
        mcq.options.forEach(
          (
            option,
            optionIndex
          )=>{
            errors.push(
              ...validateTeluguString(
                option,
                `MCQ ${n} option ${optionIndex+1}`
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

function validateGeneratedContent(x){
  if(
    !x||
    typeof x!=="object"||
    Array.isArray(x)
  ){
    throw new Error(
      "Generated result is not an object"
    );
  }

  if(Number(x.day)!==DAY){
    throw new Error(
      "Generated day mismatch"
    );
  }

  for(
    const field
    of[
      "title",
      "stage",
      "focus",
      "lesson",
      "why_it_matters",
      "common_misunderstanding",
      "reflection"
    ]
  ){
    if(typeof x[field]!=="string"){
      throw new Error(
        `Missing or invalid field: ${field}`
      );
    }
  }

  if(
    x.lesson.trim().length<500
  ){
    throw new Error(
      "Lesson is too short"
    );
  }

  if(
    x.lesson.trim().length>30000
  ){
    throw new Error(
      "Lesson is excessively long"
    );
  }

  if(
    !Array.isArray(x.examples)||
    x.examples.length<3
  ){
    throw new Error(
      "At least 3 examples are required"
    );
  }

  if(
    x.examples.length>8
  ){
    throw new Error(
      "Too many examples"
    );
  }

  for(
    const[
      index,
      example
    ]
    of x.examples.entries()
  ){
    if(
      typeof example!=="string"||
      example.trim().length<20
    ){
      throw new Error(
        `Example ${index+1} is too short`
      );
    }

    if(
      example.trim().length>2500
    ){
      throw new Error(
        `Example ${index+1} is too long`
      );
    }
  }

  if(
    x.why_it_matters.trim().length<100
  ){
    throw new Error(
      "why_it_matters is too short"
    );
  }

  if(
    x.common_misunderstanding.trim().length<50
  ){
    throw new Error(
      "common_misunderstanding is too short"
    );
  }

  if(
    x.reflection.trim().length<20
  ){
    throw new Error(
      "Reflection is too short"
    );
  }

  if(
    !Array.isArray(x.mcqs)||
    x.mcqs.length!==5
  ){
    throw new Error(
      "Exactly 5 MCQs are required"
    );
  }

  x.mcqs.forEach(
    (
      mcq,
      index
    )=>{
      const n=index+1;

      if(
        !mcq||
        typeof mcq!=="object"||
        Array.isArray(mcq)
      ){
        throw new Error(
          `MCQ ${n} must be an object`
        );
      }

      if(
        typeof mcq.question!=="string"||
        !Array.isArray(mcq.options)||
        mcq.options.length!==4||
        typeof mcq.answer!=="string"||
        typeof mcq.explanation!=="string"
      ){
        throw new Error(
          `Invalid MCQ ${n}`
        );
      }

      const options=
        mcq.options.map(
          option=>
            String(option).trim()
        );

      const answer=
        String(
          mcq.answer
        ).trim();

      if(
        options.some(
          option=>option.length===0
        )
      ){
        throw new Error(
          `MCQ ${n}: empty option`
        );
      }

      if(
        new Set(options).size!==4
      ){
        throw new Error(
          `MCQ ${n}: options must be unique`
        );
      }

      if(
        !options.includes(answer)
      ){
        throw new Error(
          `MCQ ${n}: answer is not exactly one of the options`
        );
      }

      if(
        mcq.question.trim().length<10
      ){
        throw new Error(
          `MCQ ${n}: question is too short`
        );
      }

      if(
        mcq.question.trim().length>1500
      ){
        throw new Error(
          `MCQ ${n}: question is too long`
        );
      }

      if(
        mcq.explanation.trim().length<20
      ){
        throw new Error(
          `MCQ ${n}: explanation is too short`
        );
      }
    }
  );

  if(
    !isPlainObject(
      x.constitutional_reference
    )
  ){
    throw new Error(
      "Missing constitutional_reference"
    );
  }

  for(
    const field
    of[
      "articles",
      "parts",
      "references"
    ]
  ){
    if(
      !Array.isArray(
        x.constitutional_reference[field]
      )
    ){
      throw new Error(
        `constitutional_reference.${field} must be an array`
      );
    }
  }

  const teluguErrors=
    validateTeluguContent(x);

  if(teluguErrors.length>0){
    throw new Error(
      teluguErrors.join("; ")
    );
  }

  return x;
}


/* ==========================================================================
   AUTHORITATIVE FIELD RESTORATION
========================================================================== */

function restoreAuthoritativeFields(
  generated
){
  generated.day=DAY;

  generated.title=
    syllabusEntry.title;

  generated.stage=
    syllabusEntry.stage;

  generated.focus=
    syllabusEntry.focus;

  generated.constitutional_reference={
    articles:
      Array.isArray(
        constitutionalEntry.articles
      )
        ?constitutionalEntry.articles
        :[],

    parts:
      Array.isArray(
        constitutionalEntry.parts
      )
        ?constitutionalEntry.parts
        :[],

    references:
      Array.isArray(
        constitutionalEntry.references
      )
        ?constitutionalEntry.references
        :[]
  };

  generated.source_metadata={
    source_layers:
      requiredLayers,

    source_files:
      requiredLayers.map(
        layer=>FILES[layer]
      ),

    source_status:
      "validated-before-generation",

    source_day:
      DAY,

    constitutional_source_type:
      constitutionalEntry.source_type||
      null,

    additional_sources:
      Array.isArray(
        constitutionalEntry.additional_sources
      )
        ?constitutionalEntry.additional_sources
        :[],

    legal_source_ids:
      daySources.legal&&
      Array.isArray(
        daySources.legal.legal_sources
      )
        ?unique(
            daySources.legal.legal_sources
          )
        :[],

    historical_source_ids:
      daySources.historical&&
      Array.isArray(
        daySources.historical.sources
      )
        ?unique(
            daySources.historical.sources
          )
        :[],

    judicial_doctrines:
      daySources.judicial&&
      Array.isArray(
        daySources.judicial.doctrines
      )
        ?unique(
            daySources.judicial.doctrines
          )
        :[],

    judicial_cases:
      daySources.judicial&&
      Array.isArray(
        daySources.judicial.cases
      )
        ?unique(
            daySources.judicial.cases
          )
        :[],

    official_source_ids:
      daySources.official&&
      Array.isArray(
        daySources.official.sources
      )
        ?unique(
            daySources.official.sources
          )
        :[]
  };

  return generated;
}


/* ==========================================================================
   FINAL OUTPUT VALIDATION
========================================================================== */

function validateFinalOutput(
  output
){
  validateGeneratedContent(
    output
  );

  if(Number(output.day)!==DAY){
    throw new Error(
      "Final output day mismatch"
    );
  }

  if(
    output.title!==syllabusEntry.title||
    output.stage!==syllabusEntry.stage||
    output.focus!==syllabusEntry.focus
  ){
    throw new Error(
      "Final output syllabus fields do not match authoritative syllabus"
    );
  }

  const expectedArticles=
    JSON.stringify(
      constitutionalEntry.articles||[]
    );

  const actualArticles=
    JSON.stringify(
      output.constitutional_reference?.articles||[]
    );

  if(
    expectedArticles!==actualArticles
  ){
    throw new Error(
      "Final constitutional articles do not match authoritative source"
    );
  }

  const expectedParts=
    JSON.stringify(
      constitutionalEntry.parts||[]
    );

  const actualParts=
    JSON.stringify(
      output.constitutional_reference?.parts||[]
    );

  if(
    expectedParts!==actualParts
  ){
    throw new Error(
      "Final constitutional parts do not match authoritative source"
    );
  }

  const expectedReferences=
    JSON.stringify(
      constitutionalEntry.references||[]
    );

  const actualReferences=
    JSON.stringify(
      output.constitutional_reference?.references||[]
    );

  if(
    expectedReferences!==actualReferences
  ){
    throw new Error(
      "Final constitutional references do not match authoritative source"
    );
  }

  if(
    !isPlainObject(
      output.source_metadata
    )
  ){
    throw new Error(
      "Missing final source metadata"
    );
  }

  if(
    !Array.isArray(
      output.source_metadata.source_layers
    )
  ){
    throw new Error(
      "source_metadata.source_layers must be an array"
    );
  }

  if(
    JSON.stringify(
      output.source_metadata.source_layers
    )!==
    JSON.stringify(
      requiredLayers
    )
  ){
    throw new Error(
      "Final source layers do not match validated routing"
    );
  }

  if(
    Number(
      output.source_metadata.source_day
    )!==DAY
  ){
    throw new Error(
      "Final source metadata day mismatch"
    );
  }

  if(
    output.source_metadata.source_status!==
    "validated-before-generation"
  ){
    throw new Error(
      "Invalid source metadata status"
    );
  }

  const expectedFiles=
    requiredLayers.map(
      layer=>FILES[layer]
    );

  if(
    JSON.stringify(
      output.source_metadata.source_files
    )!==
    JSON.stringify(
      expectedFiles
    )
  ){
    throw new Error(
      "Final source metadata files do not match required layers"
    );
  }

  const expectedLegal=
    daySources.legal&&
    Array.isArray(
      daySources.legal.legal_sources
    )
      ?unique(
          daySources.legal.legal_sources
        )
      :[];

  if(
    JSON.stringify(
      output.source_metadata.legal_source_ids||[]
    )!==
    JSON.stringify(
      expectedLegal
    )
  ){
    throw new Error(
      "Final legal source provenance mismatch"
    );
  }

  const expectedHistorical=
    daySources.historical&&
    Array.isArray(
      daySources.historical.sources
    )
      ?unique(
          daySources.historical.sources
        )
      :[];

  if(
    JSON.stringify(
      output.source_metadata.historical_source_ids||[]
    )!==
    JSON.stringify(
      expectedHistorical
    )
  ){
    throw new Error(
      "Final historical source provenance mismatch"
    );
  }

  const expectedDoctrines=
    daySources.judicial&&
    Array.isArray(
      daySources.judicial.doctrines
    )
      ?unique(
          daySources.judicial.doctrines
        )
      :[];

  if(
    JSON.stringify(
      output.source_metadata.judicial_doctrines||[]
    )!==
    JSON.stringify(
      expectedDoctrines
    )
  ){
    throw new Error(
      "Final judicial doctrine provenance mismatch"
    );
  }

  const expectedCases=
    daySources.judicial&&
    Array.isArray(
      daySources.judicial.cases
    )
      ?unique(
          daySources.judicial.cases
        )
      :[];

  if(
    JSON.stringify(
      output.source_metadata.judicial_cases||[]
    )!==
    JSON.stringify(
      expectedCases
    )
  ){
    throw new Error(
      "Final judicial case provenance mismatch"
    );
  }

  const expectedOfficial=
    daySources.official&&
    Array.isArray(
      daySources.official.sources
    )
      ?unique(
          daySources.official.sources
        )
      :[];

  if(
    JSON.stringify(
      output.source_metadata.official_source_ids||[]
    )!==
    JSON.stringify(
      expectedOfficial
    )
  ){
    throw new Error(
      "Final official source provenance mismatch"
    );
  }
}


/* ==========================================================================
   RETRY
========================================================================== */

function sleep(milliseconds){
  return new Promise(
    resolve=>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}

async function generateValidatedOutput(){
  let lastError=null;

  for(
    let attempt=1;
    attempt<=MAX_GENERATION_ATTEMPTS;
    attempt++
  ){
    console.log(
      `Generation attempt ${attempt}/${MAX_GENERATION_ATTEMPTS}`
    );

    try{
      const generated=
        await callGroq(attempt);

      validateGeneratedContent(
        generated
      );

      console.log(
        "AI content validation passed."
      );

      const finalOutput=
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

    }catch(error){
      lastError=error;

      const message=
        String(
          error?.message||error
        );

      console.error(
        `Attempt ${attempt} failed: ${message}`
      );

      const permanent=
        message.includes(
          "GROQ_API_KEY is missing"
        )||
        message.includes(
          "Groq HTTP 401"
        )||
        message.includes(
          "Groq HTTP 403"
        )||
        message.includes(
          "Groq HTTP 404"
        );

      if(permanent){
        throw new Error(
          `Permanent Groq configuration error: ${message}`
        );
      }

      if(
        attempt===
        MAX_GENERATION_ATTEMPTS
      ){
        break;
      }

      const retryAfterMatch=
        message.match(
          /Retry-After:\s*([0-9.]+)/i
        );

      const retryAfterSeconds=
        retryAfterMatch
          ?Number(
              retryAfterMatch[1]
            )
          :0;

      const backoff=
        2500*attempt;

      const delay=
        Math.min(
          30000,
          Math.max(
            backoff,
            retryAfterSeconds*1000
          )
        );

      console.log(
        `Waiting ${delay}ms before retry...`
      );

      await sleep(delay);
    }
  }

  throw new Error(
    `Generation failed after ${MAX_GENERATION_ATTEMPTS} validated attempts: ${lastError?.message||lastError}`
  );
}


/* ==========================================================================
   MAIN
========================================================================== */

(async()=>{
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
    "Foreign-script protection enabled."
  );

  console.log(
    "Strict constitutional accuracy rules enabled."
  );

  console.log(
    "Validated generation retries enabled."
  );

  console.log("");

  console.log(
    "Calling Groq..."
  );

  const finalOutput=
    await generateValidatedOutput();

  const output=
    path.join(
      DATA,
      `day-${String(DAY).padStart(3,"0")}.json`
    );

  fs.mkdirSync(
    DATA,
    {
      recursive:true
    }
  );

  fs.writeFileSync(
    output,
    JSON.stringify(
      finalOutput,
      null,
      2
    )+"\n",
    "utf8"
  );

  let written;

  try{
    written=
      JSON.parse(
        fs.readFileSync(
          output,
          "utf8"
        )
      );
  }catch(error){
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
    "Foreign-script validation: PASSED"
  );

  console.log(
    "Constitutional-reference validation: PASSED"
  );

  console.log(
    "Source-provenance validation: PASSED"
  );

  console.log(
    "Final JSON re-read validation: PASSED"
  );

  console.log(
    "=========================================="
  );

})().catch(
  error=>{
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
