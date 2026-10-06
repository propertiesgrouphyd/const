const fs=require("fs"),path=require("path");const DAY=Number(process.env.DAY||0),VALIDATE_ONLY=process.argv.includes("--validate"),ROOT=process.cwd(),DATA=path.join(ROOT,"data"),FILES={syllabus:"syllabus.json",sourceMap:"source-map.json",constitutional:"constitutional-sources.json",historical:"historical-sources.json",legal:"legal-sources.json",judicial:"judicial-sources.json",official:"official-sources.json"},ALLOWED_CONSTITUTIONAL_TYPES=new Set(["constitutional","conceptual","historical","statutory","judicial","mixed"]),ALLOWED_SOURCE_LAYERS=new Set(["constitutional","historical","legal","judicial","official"]),REQUIRED_TEXT_FIELDS=["title","stage","focus","lesson","why_it_matters","common_misunderstanding","reflection"],MAX_GENERATION_ATTEMPTS=4;
function loadJson(fileName){const filePath=path.join(DATA,fileName);if(!fs.existsSync(filePath))throw new Error(`Required source file not found: data/${fileName}`);try{return JSON.parse(fs.readFileSync(filePath,"utf8"))}catch(error){throw new Error(`Invalid JSON in data/${fileName}: ${error.message}`)}}
if(!Number.isInteger(DAY)||DAY<1||DAY>365)throw new Error("DAY must be an integer between 1 and 365");
const SYLLABUS=loadJson(FILES.syllabus),SOURCE_MAP=loadJson(FILES.sourceMap),CONSTITUTIONAL=loadJson(FILES.constitutional),HISTORICAL=loadJson(FILES.historical),LEGAL=loadJson(FILES.legal),JUDICIAL=loadJson(FILES.judicial),OFFICIAL=loadJson(FILES.official);
if(!Array.isArray(SYLLABUS))throw new Error("syllabus.json must contain an array");
if(SYLLABUS.length!==365)throw new Error(`syllabus.json must contain exactly 365 entries; found ${SYLLABUS.length}`);
if(!CONSTITUTIONAL||typeof CONSTITUTIONAL!=="object"||Array.isArray(CONSTITUTIONAL)||!CONSTITUTIONAL.days||typeof CONSTITUTIONAL.days!=="object"||Array.isArray(CONSTITUTIONAL.days))throw new Error("constitutional-sources.json must contain a days object");
if(!SOURCE_MAP||typeof SOURCE_MAP!=="object"||Array.isArray(SOURCE_MAP))throw new Error("source-map.json must contain an object");
const syllabusEntry=SYLLABUS.find(item=>Number(item?.day)===DAY);if(!syllabusEntry)throw new Error(`Syllabus entry not found for day ${DAY}`);
const constitutionalEntry=CONSTITUTIONAL.days[String(DAY)];if(!constitutionalEntry)throw new Error(`Constitutional source not found for day ${DAY}`);
function getDaySource(container,day){if(!container||typeof container!=="object"||!container.days||typeof container.days!=="object"||Array.isArray(container.days))return null;return container.days[String(day)]||null}
function getSourceType(entry){return String(entry?.source_type||"").trim().toLowerCase()}
function unique(values){return[...new Set(values.filter(value=>value!==undefined&&value!==null&&String(value).trim()!=="").map(String))]}
function isPlainObject(value){return value!==null&&typeof value==="object"&&!Array.isArray(value)}
const daySources={constitutional:constitutionalEntry,historical:getDaySource(HISTORICAL,DAY),legal:getDaySource(LEGAL,DAY),judicial:getDaySource(JUDICIAL,DAY),official:getDaySource(OFFICIAL,DAY)};
function validateSourceMap(){const errors=[],expectedFiles={constitutional:FILES.constitutional,historical:FILES.historical,legal:FILES.legal,judicial:FILES.judicial,official:FILES.official};if(!SOURCE_MAP.source_files||typeof SOURCE_MAP.source_files!=="object"||Array.isArray(SOURCE_MAP.source_files))errors.push("source-map.json is missing source_files");else for(const[layer,fileName]of Object.entries(expectedFiles))if(SOURCE_MAP.source_files[layer]!==fileName)errors.push(`source-map.json source_files.${layer} must be "${fileName}"`);if(!SOURCE_MAP.validation||typeof SOURCE_MAP.validation!=="object")errors.push("source-map.json is missing validation");else if(!Array.isArray(SOURCE_MAP.validation.allowed_source_types))errors.push("source-map.json is missing validation.allowed_source_types");else for(const type of SOURCE_MAP.validation.allowed_source_types)if(!ALLOWED_SOURCE_LAYERS.has(type))errors.push(`source-map.json contains unsupported source type "${type}"`);if(SOURCE_MAP.day_map!==undefined&&(SOURCE_MAP.day_map===null||typeof SOURCE_MAP.day_map!=="object"||Array.isArray(SOURCE_MAP.day_map)))errors.push("source-map.json day_map must be an object");return errors}
function determineRequiredLayers(){const layers=["constitutional"],constitutionalType=getSourceType(constitutionalEntry),additional=Array.isArray(constitutionalEntry.additional_sources)?constitutionalEntry.additional_sources:[];if(constitutionalType==="historical"||additional.includes("historical-sources.json")||daySources.historical)layers.push("historical");if(constitutionalType==="statutory"||additional.includes("legal-sources.json")||daySources.legal)layers.push("legal");if(constitutionalType==="judicial"||additional.includes("judicial-sources.json")||daySources.judicial)layers.push("judicial");if(additional.includes("official-sources.json")||daySources.official)layers.push("official");return unique(layers)}
const requiredLayers=determineRequiredLayers();
function validateSyllabus(){const errors=[],allDays=SYLLABUS.map(item=>Number(item?.day)),uniqueDays=new Set(allDays);if(uniqueDays.size!==365)errors.push("syllabus.json contains duplicate day numbers");for(let day=1;day<=365;day++)if(!uniqueDays.has(day))errors.push(`syllabus.json is missing day ${day}`);if(Number(syllabusEntry.day)!==DAY)errors.push(`Day ${DAY}: syllabus day mismatch`);for(const field of["title","stage","focus"])if(typeof syllabusEntry[field]!=="string"||syllabusEntry[field].trim()==="")errors.push(`Day ${DAY}: syllabus field "${field}" is missing`);return errors}
function validateConstitutionalSource(){const errors=[],entry=daySources.constitutional;if(!entry){errors.push(`Day ${DAY}: constitutional source missing`);return errors}if(!isPlainObject(entry)){errors.push(`Day ${DAY}: constitutional source must be an object`);return errors}const sourceType=getSourceType(entry);if(!ALLOWED_CONSTITUTIONAL_TYPES.has(sourceType))errors.push(`Day ${DAY}: unsupported source_type "${sourceType}"`);for(const field of["articles","parts","references"])if(!Array.isArray(entry[field]))errors.push(`Day ${DAY}: constitutional ${field} must be an array`);if(entry.additional_sources!==undefined&&!Array.isArray(entry.additional_sources))errors.push(`Day ${DAY}: additional_sources must be an array`);if(Array.isArray(entry.additional_sources)){const allowedAdditional=new Set(["historical-sources.json","legal-sources.json","judicial-sources.json","official-sources.json"]);for(const sourceFile of entry.additional_sources)if(!allowedAdditional.has(sourceFile))errors.push(`Day ${DAY}: unsupported additional source "${sourceFile}"`)}return errors}
function validateRequiredSources(){const errors=[];for(const layer of requiredLayers)if(!daySources[layer])errors.push(`Missing ${layer} source entry for day ${DAY}`);return errors}
function validateLegalSources(){const errors=[],entry=daySources.legal;if(!entry)return errors;if(!isPlainObject(entry)){errors.push(`Day ${DAY}: legal source entry must be an object`);return errors}if(String(entry.status||"").trim().toLowerCase()==="unresolved")errors.push(`Day ${DAY}: legal source entry is explicitly unresolved`);if(!Array.isArray(entry.legal_sources)){errors.push(`Day ${DAY}: legal_sources must be an array`);return errors}const registry=Array.isArray(LEGAL.primary_legal_sources)?LEGAL.primary_legal_sources:[],validIds=new Set(registry.map(source=>source&&source.id).filter(Boolean)),declared=unique(entry.legal_sources);if(declared.length===0)errors.push(`Day ${DAY}: legal source entry contains no resolved legal source`);for(const sourceId of declared)if(!validIds.has(sourceId))errors.push(`Day ${DAY}: unresolved legal source "${sourceId}"`);return errors}
function validateHistoricalSources(){const errors=[],entry=daySources.historical;if(!entry)return errors;if(!isPlainObject(entry)){errors.push(`Day ${DAY}: historical source entry must be an object`);return errors}if(String(entry.status||"").trim().toLowerCase()==="unresolved")errors.push(`Day ${DAY}: historical source entry is unresolved`);if(!Array.isArray(entry.sources)){errors.push(`Day ${DAY}: historical sources must be an array`);return errors}const registry=Array.isArray(HISTORICAL.primary_historical_sources)?HISTORICAL.primary_historical_sources:[],validIds=new Set(registry.map(source=>source&&source.id).filter(Boolean)),declared=unique(entry.sources);if(declared.length===0)errors.push(`Day ${DAY}: historical source entry contains no resolved source`);for(const sourceId of declared)if(!validIds.has(sourceId))errors.push(`Day ${DAY}: unresolved historical source "${sourceId}"`);return errors}
function validateJudicialSources(){const errors=[],entry=daySources.judicial;if(!entry)return errors;if(!isPlainObject(entry)){errors.push(`Day ${DAY}: judicial source entry must be an object`);return errors}const caseRegistry=isPlainObject(JUDICIAL.case_registry)?JUDICIAL.case_registry:{},doctrineRegistry=isPlainObject(JUDICIAL.doctrine_registry)?JUDICIAL.doctrine_registry:{};if(String(entry.status||"").trim().toLowerCase()==="unresolved")errors.push(`Day ${DAY}: judicial source is unresolved`);const doctrines=Array.isArray(entry.doctrines)?unique(entry.doctrines):[],cases=Array.isArray(entry.cases)?unique(entry.cases):[];if(doctrines.length===0&&cases.length===0){errors.push(`Day ${DAY}: judicial source must declare at least one verified doctrine or case`);return errors}for(const doctrineId of doctrines){const doctrine=doctrineRegistry[doctrineId];if(!doctrine){errors.push(`Day ${DAY}: unresolved judicial doctrine "${doctrineId}"`);continue}if(String(doctrine.status||"").trim().toLowerCase()==="requires_verified_case_sources")errors.push(`Day ${DAY}: doctrine "${doctrineId}" requires verified case sources`);const caseSources=Array.isArray(doctrine.case_sources)?unique(doctrine.case_sources):[];if(caseSources.length===0)errors.push(`Day ${DAY}: doctrine "${doctrineId}" has no verified case sources`);for(const caseId of caseSources)if(!caseRegistry[caseId])errors.push(`Day ${DAY}: doctrine "${doctrineId}" references missing case "${caseId}"`)}for(const caseId of cases)if(!caseRegistry[caseId])errors.push(`Day ${DAY}: unresolved judicial case "${caseId}"`);return errors}
function validateOfficialSources(){const errors=[],entry=daySources.official;if(!entry)return errors;if(!isPlainObject(entry)){errors.push(`Day ${DAY}: official source entry must be an object`);return errors}if(String(entry.status||"").trim().toLowerCase()==="unresolved")errors.push(`Day ${DAY}: official source entry is unresolved`);if(!Array.isArray(entry.sources)){errors.push(`Day ${DAY}: official sources must be an array`);return errors}const registry=isPlainObject(OFFICIAL.institution_registry)?OFFICIAL.institution_registry:{},declared=unique(entry.sources);if(declared.length===0)errors.push(`Day ${DAY}: official source entry contains no resolved source`);for(const sourceId of declared)if(!registry[sourceId])errors.push(`Day ${DAY}: unresolved official source "${sourceId}"`);return errors}
function validateDayRouting(){const errors=[],dayMap=SOURCE_MAP.day_map&&typeof SOURCE_MAP.day_map==="object"&&!Array.isArray(SOURCE_MAP.day_map)?SOURCE_MAP.day_map:{},explicit=dayMap[String(DAY)];if(!explicit)return errors;if(!isPlainObject(explicit)){errors.push(`Day ${DAY}: source-map day entry must be an object`);return errors}if(!Array.isArray(explicit.sources)){errors.push(`Day ${DAY}: source-map day entry must contain a sources array`);return errors}const declaredLayers=unique(explicit.sources);for(const layer of declaredLayers)if(!ALLOWED_SOURCE_LAYERS.has(layer))errors.push(`Day ${DAY}: source-map contains unsupported source layer "${layer}"`);for(const layer of declaredLayers)if(!requiredLayers.includes(layer))errors.push(`Day ${DAY}: source-map declares "${layer}" but authoritative routing does not require it`);for(const layer of requiredLayers)if(!declaredLayers.includes(layer))errors.push(`Day ${DAY}: authoritative routing requires "${layer}" but source-map does not declare it`);return errors}
const validationErrors=[...validateSourceMap(),...validateSyllabus(),...validateConstitutionalSource(),...validateRequiredSources(),...validateDayRouting(),...validateLegalSources(),...validateHistoricalSources(),...validateJudicialSources(),...validateOfficialSources()];
if(validationErrors.length>0){console.error("");console.error("==========================================");console.error("SOURCE VALIDATION FAILED");console.error("==========================================");for(const error of validationErrors)console.error(`ERROR: ${error}`);console.error("");console.error(`Day ${DAY} was NOT sent to the AI generator.`);console.error("==========================================");process.exit(1)}
if(VALIDATE_ONLY){console.log("");console.log("==========================================");console.log("CONSTITUTION 365 SOURCE VALIDATION");console.log("==========================================");console.log(`Day: ${DAY}`);console.log(`Title: ${syllabusEntry.title}`);console.log(`Required sources: ${requiredLayers.join(", ")}`);console.log("");console.log("All authoritative source validations passed.");console.log("No AI generation was performed.");console.log("==========================================");process.exit(0)}
function buildSourceContext(){return{constitutional:{source_type:constitutionalEntry.source_type||null,articles:constitutionalEntry.articles||[],parts:constitutionalEntry.parts||[],references:constitutionalEntry.references||[]},historical:daySources.historical?{sources:daySources.historical.sources||[],historical_focus:daySources.historical.historical_focus||[],use:daySources.historical.use||"",note:daySources.historical.note||""}:null,legal:daySources.legal?{legal_sources:daySources.legal.legal_sources||[],articles:daySources.legal.articles||[],parts:daySources.legal.parts||[],references:daySources.legal.references||[],coverage:daySources.legal.coverage||"",note:daySources.legal.note||""}:null,judicial:daySources.judicial?{status:daySources.judicial.status||null,doctrines:daySources.judicial.doctrines||[],cases:daySources.judicial.cases||[],references:daySources.judicial.references||[],use:daySources.judicial.use||""}:null,official:daySources.official?{sources:daySources.official.sources||[],references:daySources.official.references||[],use:daySources.official.use||""}:null}}
const SOURCE_CONTEXT=buildSourceContext();
const prompt=`
You are creating Day ${DAY} of CONSTITUTION 365, a premium Telugu constitutional education program for ordinary citizens, students, workers, parents, professionals and senior citizens.

The purpose is to make the Constitution of India understandable, practical, human, memorable and useful in real life. This is NOT exam coaching, NOT a textbook, NOT a coaching-centre answer sheet and NOT a list of legal statements.

Write as an excellent Telugu constitutional educator speaking clearly to a real person who may know nothing about constitutional law.

Use natural, modern, grammatically correct Telugu. Do not translate English sentence-by-sentence. Explain ideas naturally.

TODAY'S AUTHORITATIVE SYLLABUS:
Day: ${syllabusEntry.day}
Title: ${syllabusEntry.title}
Stage: ${syllabusEntry.stage}
Focus: ${syllabusEntry.focus}

AUTHORITATIVE SOURCE CONTEXT:
${JSON.stringify(SOURCE_CONTEXT,null,2)}

SOURCE DISCIPLINE:
Treat every supplied source layer separately.
CONSTITUTIONAL = Constitution of India itself.
HISTORICAL = historical background only.
LEGAL = ordinary legislation and statutory frameworks.
JUDICIAL = court interpretation and constitutional doctrine.
OFFICIAL = official institutional information.
Never merge these categories. Never describe a statute as constitutional text. Never describe a judgment as an Article. Never describe historical background as a constitutional provision. Never describe an official institutional fact as constitutional text.

ABSOLUTE FACTUAL ACCURACY:
Use ONLY information supported by the supplied authoritative source context.
Do NOT invent or infer Articles, Parts, Schedules, constitutional powers, constitutional procedures, constitutional institutions, Acts, sections, statutory procedures, statutory penalties, statutory authorities, legal rights, historical dates, historical events, historical quotations, court cases, case names, citations, judgment dates, bench composition, judicial holdings, judicial quotations or institutional facts.
If a fact is not supported by the supplied sources, OMIT it.
Do not fill source gaps from general knowledge.
Do not add a legal claim merely to make the lesson sound sophisticated.
When the source supports only a general principle, explain only that principle.
Do not turn constitutional values, Directive Principles, Fundamental Rights, statutory rights, electoral rules or judicially interpreted principles into one undifferentiated category.

VERY IMPORTANT LEGAL PRECISION:
Do not make broad claims such as saying that the Constitution gives everyone a particular right unless the supplied source specifically establishes that proposition.
Do not label education, health, livelihood, voting or any other subject as a constitutional right unless the supplied source specifically supports that exact characterization.
Do not state that every unconstitutional law automatically becomes void unless the supplied source specifically supports the exact formulation.
Use precise wording at all times.

LESSON — HUMAN, PRACTICAL AND EASY TO UNDERSTAND:
Create one complete lesson ONLY about this day's topic.

The reader may have no legal background. Explain the topic so an ordinary person can understand it without exam preparation or prior knowledge.

The lesson must feel like an excellent person is personally explaining the Constitution clearly to another human being.

Do not simply state a constitutional principle. Explain it.

Whenever appropriate, naturally use this teaching flow:
IDEA -> SIMPLE EXPLANATION -> REALISTIC EVERYDAY SITUATION -> WHAT HAPPENS IN THAT SITUATION -> HOW IT CONNECTS TO TODAY'S TOPIC -> WHAT THE AUTHORITATIVE SOURCE ACTUALLY ESTABLISHES.
Do not mechanically repeat this pattern.

Explain clearly:
- what the idea means;
- why it matters;
- what the Constitution actually establishes;
- how an ordinary person can understand the idea in daily life;
- what people commonly misunderstand;
- what the supplied authoritative sources actually establish.

Start naturally. Do not use the same opening every day. Do not repeat the title as filler. Do not fill space with repeated statements.

REAL-LIFE EXAMPLES:
Examples are extremely important.

Do NOT treat a restatement of the constitutional principle as an example.

An example must describe a recognisable situation that a real person can understand. A useful example normally contains a clear person, group or ordinary situation, something that happens or could happen, the constitutional question or idea involved, and a clear explanation of how that situation connects to today's topic.

Examples may involve ordinary situations such as a family, student, worker, parent, professional, citizen dealing with a public institution, people living in different communities, a workplace, school, public service, local community or another ordinary human situation — BUT ONLY when the supplied authoritative sources support the constitutional point being illustrated.

Do not invent a legal right, government power, procedure, penalty, case outcome or other legal fact merely to create an interesting example.

A statement such as "this principle is important to citizens" is NOT an example.
A statement such as "this shows why the Constitution matters" is NOT an example.
A vague hypothetical with no clear situation is NOT an example.

Prefer examples that let the reader picture the situation immediately and then understand exactly why it relates to the day's topic.

EXAMPLE VARIETY:
Provide 3 to 8 genuinely useful examples.
Do not make every example a variation of the same sentence.
Where the topic permits, use different perspectives such as an ordinary citizen, family or community, student or young person, worker or professional, or interaction with a public institution.
Do not force variety when the authoritative source does not support it.
Quality is more important than quantity, but never provide fewer than 3 examples.

COMPARISONS:
When a comparison makes the concept easier to understand, use one naturally.
Useful comparisons may distinguish what people commonly assume from what the Constitution actually establishes, one situation from another, constitutional text from statutory law, or constitutional text from judicial interpretation.
Do not create decorative comparisons.

COMMON MISUNDERSTANDING:
Identify a genuine misunderstanding that an ordinary reader could reasonably have about today's topic.
Clearly distinguish:
WHAT PEOPLE MAY THINK
from
WHAT THE SUPPLIED AUTHORITATIVE SOURCES ACTUALLY ESTABLISH.
Do not use a generic sentence merely to satisfy this field.

PRACTICAL VALUE:
The reader should finish with understanding that remains useful outside an examination.
Do not give legal advice.
Do not tell the reader what legal action to take unless the supplied sources specifically support that information.
Help the reader recognise and understand today's constitutional idea in ordinary life.

NATURAL WRITING:
Use natural Telugu.
Vary sentence length and paragraph structure.
Do not use the same opening pattern every day.
Do not repeatedly write generic phrases such as "ఇది చాలా ముఖ్యమైనది" or "ప్రతి పౌరుడికి ఇది ముఖ్యమైనది" unless genuinely necessary.
Do not make every paragraph sound like a definition.
Do not make every example begin with the same phrase.
Do not turn the lesson into coaching-centre material.
Do not use artificial drama.
Do not create fictional constitutional facts.
Do not create stories whose legal outcome is unsupported.

SOURCE-SAFE EXAMPLES:
A realistic situation is allowed only when the constitutional or legal conclusion drawn from it is supported by the supplied sources.
If a useful example would require an unsupported legal conclusion, DO NOT use that example.
Use a simpler example that can be safely supported.

LEGAL SOURCE LAYERING:
When legislation is supplied, clearly distinguish constitutional foundation from statutory framework.
When judicial material is supplied, clearly distinguish constitutional text from judicial interpretation.
When historical material is supplied, clearly distinguish historical background from constitutional text.
When official material is supplied, clearly distinguish official institutional information from constitutional text.

FINAL LESSON QUALITY TEST:
Before returning the JSON, silently check:
1. Could a person with no legal background understand this?
2. Does the lesson explain rather than merely state?
3. Are the examples actual situations rather than restated principles?
4. Does each example clearly help explain today's topic?
5. Are examples varied where appropriate?
6. Is the connection between each example and the constitutional idea clearly explained?
7. Is the common misunderstanding genuine and clearly corrected?
8. Is the lesson useful outside an examination?
9. Does anything sound like coaching-centre material?
10. Did any example introduce an unsupported legal fact?
If any answer to 1-9 is NO, improve the lesson before returning it.
If answer 10 is YES, remove or rewrite that example.

DO NOT MENTION:
Do not mention this prompt, AI, Groq, syllabus, generation, source validation, internal files, source registries or internal implementation.

CONTENT LENGTH REQUIREMENTS:
LESSON: 500 to 30000 characters. Complete, clear and educational. Do not repeat sentences to reach the minimum.
EXAMPLES: 3 to 8 items. Each 20 to 2500 characters. Every example must be concrete, useful and directly supported by the authoritative source context.
WHY IT MATTERS: at least 100 characters and must explain practical importance rather than repeat the lesson.
COMMON MISUNDERSTANDING: at least 50 characters and must identify a genuine misunderstanding and correct it.
REFLECTION: at least 20 characters and should be one meaningful real-life question.

MCQs:
Create EXACTLY 5 high-quality multiple-choice questions.
Each MCQ must contain EXACTLY 4 unique options and exactly ONE correct answer.
The answer must exactly match one option.
Every MCQ must be answerable from the supplied source context and lesson.
Do not use outside legal knowledge.
Do not make questions difficult merely by changing terminology or asking obscure facts.
Test understanding rather than memorisation.
Use a balanced mixture of direct understanding, realistic everyday application, misconception checking and deeper comparison or reasoning.
Where the topic permits, at least 2 questions should use realistic situations.
At least 1 question should test a common misunderstanding.
At least 1 question should test the central concept directly.
Each explanation must explain WHY the selected option is correct. Where useful, briefly explain why a tempting alternative is wrong.
Do not introduce an unsupported Article, Act, case, right, procedure or legal conclusion merely to make an MCQ difficult.

MCQ QUALITY CONTROL:
Before returning JSON, silently check every MCQ:
1. Is the question supported by the supplied sources?
2. Is there exactly one correct option?
3. Does the answer exactly match one option?
4. Are all four options unique?
5. Does the explanation explain the reasoning?
6. Did the question introduce an unsupported legal fact?
If any answer is NO, rewrite that MCQ.

LANGUAGE:
This is the Telugu edition of Vidhwaan Constitution 365.
All educational content generated by the model must be natural Telugu using Telugu script.
This applies to lesson, examples, why_it_matters, common_misunderstanding, MCQ questions, options, answers, explanations and reflection.
Do NOT use English alphabet characters merely for convenience.
Do NOT use transliterated Telugu.
Do NOT randomly mix English words into Telugu sentences.
Use Telugu equivalents whenever available.
Do not use foreign scripts.
Official identifiers restored by the application must not be repeated unnecessarily inside educational prose.

OUTPUT:
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

IMPORTANT:
The constitutional_reference values must reproduce the supplied constitutional source exactly.
Do not alter articles, parts or references.
The application will restore authoritative fields after generation, so do not attempt to change their meaning.
Do not put internal source identifiers or implementation details into educational prose.
Return valid JSON only.
`;
async function callGroq(attempt){const key=process.env.GROQ_API_KEY;if(!key)throw new Error("GROQ_API_KEY is missing");try{const model=process.env.GROQ_MODEL||"openai/gpt-oss-120b",response=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({model,temperature:.2,reasoning_effort:"medium",max_completion_tokens:20000,response_format:{type:"json_object"},messages:[{role:"system",content:"You are an exceptionally careful constitutional educator, Telugu editor and factual verifier. Return only valid JSON. Follow the requested structure exactly. Never invent legal facts."},{role:"user",content:prompt}]})});let body=null;try{body=await response.json()}catch{}if(!response.ok){const retryAfter=response.headers.get("retry-after");const detail=body?.error?.message||body?.error?.code||JSON.stringify(body)||"Unknown Groq error";const error=new Error(`Groq HTTP ${response.status}: ${detail}`);error.status=response.status;error.retryAfter=retryAfter;throw error}const message=body?.choices?.[0]?.message;if(message?.refusal)throw new Error(`Groq refusal: ${message.refusal}`);const content=message?.content;if(typeof content!=="string"||!content.trim())throw new Error("Groq returned empty content");try{return JSON.parse(content)}catch(error){throw new Error(`Groq returned invalid JSON: ${error.message}`)}}catch(error){throw error}}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function getRetryDelay(error,attempt){const retryAfter=Number(error?.retryAfter);if(Number.isFinite(retryAfter)&&retryAfter>=0)return Math.min(retryAfter*1000,30000);return Math.min(2500*attempt,30000)}
function sanitizeGeneratedText(value){if(typeof value!=="string")return value;return value.normalize("NFC").replace(/\uFFFD/g,"").replace(/\\/g,"").replace(/\u0000/g,"").replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g,"").trim()}
function sanitizeGeneratedObject(x){if(!x||typeof x!=="object")return x;for(const field of REQUIRED_TEXT_FIELDS)if(typeof x[field]==="string")x[field]=sanitizeGeneratedText(x[field]);if(Array.isArray(x.examples))x.examples=x.examples.map(sanitizeGeneratedText);if(Array.isArray(x.mcqs))for(const mcq of x.mcqs){if(!mcq||typeof mcq!=="object")continue;for(const field of["question","answer","explanation"])if(typeof mcq[field]==="string")mcq[field]=sanitizeGeneratedText(mcq[field]);if(Array.isArray(mcq.options))mcq.options=mcq.options.map(sanitizeGeneratedText)}return x}
function containsTelugu(value){return typeof value==="string"&&/[\u0C00-\u0C7F]/u.test(value)}
function validateTeluguString(value,label){if(typeof value!=="string")throw new Error(`${label} must be a string`);const text=value.trim();if(!text)throw new Error(`${label} is empty`);if(!containsTelugu(text))throw new Error(`${label} contains no Telugu text`);if(/[\u0400-\u04FF\u0370-\u03FF\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0780-\u07BF\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C80-\u0CFF\u0D00-\u0D7F\u0D80-\u0DFF\u0E00-\u0E7F\u0E80-\u0EFF\u1000-\u109F\u1100-\u11FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/u.test(text))throw new Error(`${label} contains forbidden foreign script characters`);if(/\uFFFD/.test(text))throw new Error(`${label} contains replacement characters`);if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text))throw new Error(`${label} contains control characters`);
if(/\\/u.test(text))throw new Error(`${label} contains forbidden backslash characters`)}
function validateGeneratedContent(x){if(!x||typeof x!=="object"||Array.isArray(x))throw new Error("Generated result is not an object");if(Number(x.day)!==DAY)throw new Error("Generated day mismatch");for(const field of["title","stage","focus","lesson","why_it_matters","common_misunderstanding","reflection"])if(typeof x[field]!=="string")throw new Error(`Missing or invalid field: ${field}`);if(x.lesson.trim().length<500)throw new Error("Lesson is too short");if(x.lesson.trim().length>30000)throw new Error("Lesson is excessively long");if(!Array.isArray(x.examples)||x.examples.length<3)throw new Error("At least 3 examples are required");if(x.examples.length>8)throw new Error("Too many examples");for(const[index,example]of x.examples.entries()){if(typeof example!=="string"||example.trim().length<20)throw new Error(`Example ${index+1} is too short`);if(example.trim().length>2500)throw new Error(`Example ${index+1} is too long`)}if(x.why_it_matters.trim().length<100)throw new Error("why_it_matters is too short");if(x.common_misunderstanding.trim().length<50)throw new Error("common_misunderstanding is too short");if(x.reflection.trim().length<20)throw new Error("Reflection is too short");if(!Array.isArray(x.mcqs)||x.mcqs.length!==5)throw new Error("Exactly 5 MCQs are required");x.mcqs.forEach((mcq,index)=>{const n=index+1;if(!mcq||typeof mcq!=="object"||Array.isArray(mcq))throw new Error(`MCQ ${n} must be an object`);if(typeof mcq.question!=="string"||!Array.isArray(mcq.options)||mcq.options.length!==4||typeof mcq.answer!=="string"||typeof mcq.explanation!=="string")throw new Error(`Invalid MCQ ${n}`);const options=mcq.options.map(option=>String(option).trim()),answer=String(mcq.answer).trim();if(options.some(option=>option.length===0))throw new Error(`MCQ ${n}: empty option`);if(new Set(options).size!==4)throw new Error(`MCQ ${n}: options must be unique`);if(!options.includes(answer))throw new Error(`MCQ ${n}: answer must exactly match one option`);if(mcq.question.trim().length<10)throw new Error(`MCQ ${n}: question is too short`);if(mcq.question.trim().length>1500)throw new Error(`MCQ ${n}: question is too long`);if(mcq.explanation.trim().length<20)throw new Error(`MCQ ${n}: explanation is too short`)});for(const field of["title","stage","focus","lesson","why_it_matters","common_misunderstanding","reflection"])validateTeluguString(x[field],field);x.examples.forEach((example,index)=>validateTeluguString(example,`examples[${index}]`));x.mcqs.forEach((mcq,index)=>{validateTeluguString(mcq.question,`mcqs[${index}].question`);mcq.options.forEach((option,j)=>validateTeluguString(option,`mcqs[${index}].options[${j}]`));validateTeluguString(mcq.answer,`mcqs[${index}].answer`);validateTeluguString(mcq.explanation,`mcqs[${index}].explanation`)});if(!x.constitutional_reference||typeof x.constitutional_reference!=="object"||Array.isArray(x.constitutional_reference))throw new Error("constitutional_reference is missing");for(const field of["articles","parts","references"])if(!Array.isArray(x.constitutional_reference[field]))throw new Error(`constitutional_reference.${field} must be an array`)}
function restoreAuthoritativeFields(generated){generated.day=DAY;generated.title=syllabusEntry.title;generated.stage=syllabusEntry.stage;generated.focus=syllabusEntry.focus;generated.constitutional_reference={articles:Array.isArray(constitutionalEntry.articles)?constitutionalEntry.articles:[],parts:Array.isArray(constitutionalEntry.parts)?constitutionalEntry.parts:[],references:Array.isArray(constitutionalEntry.references)?constitutionalEntry.references:[]};generated.source_metadata={source_layers:requiredLayers,source_files:requiredLayers.map(layer=>FILES[layer]),source_status:"validated-before-generation",source_day:DAY,constitutional_source_type:constitutionalEntry.source_type||null,additional_sources:Array.isArray(constitutionalEntry.additional_sources)?constitutionalEntry.additional_sources:[],legal_source_ids:daySources.legal&&Array.isArray(daySources.legal.legal_sources)?unique(daySources.legal.legal_sources):[],historical_source_ids:daySources.historical&&Array.isArray(daySources.historical.sources)?unique(daySources.historical.sources):[],judicial_doctrines:daySources.judicial&&Array.isArray(daySources.judicial.doctrines)?unique(daySources.judicial.doctrines):[],judicial_cases:daySources.judicial&&Array.isArray(daySources.judicial.cases)?unique(daySources.judicial.cases):[],official_source_ids:daySources.official&&Array.isArray(daySources.official.sources)?unique(daySources.official.sources):[]};return generated}
function validateFinalOutput(x){validateGeneratedContent(x);if(Number(x.day)!==DAY)throw new Error("Final day mismatch");if(x.title!==syllabusEntry.title)throw new Error("Final title does not match authoritative syllabus");if(x.stage!==syllabusEntry.stage)throw new Error("Final stage does not match authoritative syllabus");if(x.focus!==syllabusEntry.focus)throw new Error("Final focus does not match authoritative syllabus");const expectedReference={articles:Array.isArray(constitutionalEntry.articles)?constitutionalEntry.articles:[],parts:Array.isArray(constitutionalEntry.parts)?constitutionalEntry.parts:[],references:Array.isArray(constitutionalEntry.references)?constitutionalEntry.references:[]};if(JSON.stringify(x.constitutional_reference)!==JSON.stringify(expectedReference))throw new Error("Final constitutional_reference does not match authoritative source");if(!x.source_metadata||typeof x.source_metadata!=="object")throw new Error("Final source_metadata is missing");if(JSON.stringify(x.source_metadata.source_layers)!==JSON.stringify(requiredLayers))throw new Error("Final source layers do not match required layers");if(Number(x.source_metadata.source_day)!==DAY)throw new Error("Final source day mismatch");if(x.source_metadata.source_status!=="validated-before-generation")throw new Error("Final source status mismatch");const expectedFiles=requiredLayers.map(layer=>FILES[layer]);if(JSON.stringify(x.source_metadata.source_files)!==JSON.stringify(expectedFiles))throw new Error("Final source files do not match required files");const expectedLegal=daySources.legal&&Array.isArray(daySources.legal.legal_sources)?unique(daySources.legal.legal_sources):[];const expectedHistorical=daySources.historical&&Array.isArray(daySources.historical.sources)?unique(daySources.historical.sources):[];const expectedDoctrines=daySources.judicial&&Array.isArray(daySources.judicial.doctrines)?unique(daySources.judicial.doctrines):[];const expectedCases=daySources.judicial&&Array.isArray(daySources.judicial.cases)?unique(daySources.judicial.cases):[];const expectedOfficial=daySources.official&&Array.isArray(daySources.official.sources)?unique(daySources.official.sources):[];if(JSON.stringify(x.source_metadata.legal_source_ids)!==JSON.stringify(expectedLegal))throw new Error("Final legal provenance mismatch");if(JSON.stringify(x.source_metadata.historical_source_ids)!==JSON.stringify(expectedHistorical))throw new Error("Final historical provenance mismatch");if(JSON.stringify(x.source_metadata.judicial_doctrines)!==JSON.stringify(expectedDoctrines))throw new Error("Final judicial doctrine provenance mismatch");if(JSON.stringify(x.source_metadata.judicial_cases)!==JSON.stringify(expectedCases))throw new Error("Final judicial case provenance mismatch");if(JSON.stringify(x.source_metadata.official_source_ids)!==JSON.stringify(expectedOfficial))throw new Error("Final official provenance mismatch")}
(async()=>{let generated=null,lastError=null;for(let attempt=1;attempt<=MAX_GENERATION_ATTEMPTS;attempt++){try{console.log(`Generation attempt ${attempt}/${MAX_GENERATION_ATTEMPTS}`);generated=await callGroq(attempt);generated=sanitizeGeneratedObject(generated);validateGeneratedContent(generated);break}catch(error){lastError=error;console.error(`Generation attempt ${attempt} failed: ${error.message}`);if(error.message==="GROQ_API_KEY is missing"||error.status===401||error.status===403||error.status===404)throw error;if(attempt<MAX_GENERATION_ATTEMPTS){const delay=getRetryDelay(error,attempt);console.log(`Retrying in ${delay} ms...`);await sleep(delay)}}}if(!generated)throw lastError||new Error("Generation failed");const finalOutput=restoreAuthoritativeFields(generated);validateFinalOutput(finalOutput);const output=path.join(DATA,`day-${String(DAY).padStart(3,"0")}.json`);fs.writeFileSync(output,JSON.stringify(finalOutput,null,2)+"\n","utf8");let written;try{written=JSON.parse(fs.readFileSync(output,"utf8"))}catch(error){throw new Error(`Generated file is not valid JSON: ${error.message}`)}validateFinalOutput(written);console.log("");console.log("==========================================");console.log("CONSTITUTION 365 GENERATION SUCCESSFUL");console.log("==========================================");console.log(`Day: ${DAY}`);console.log(`Created: ${output}`);console.log(`Examples: ${written.examples.length}`);console.log(`MCQs: ${written.mcqs.length}`);console.log(`Source layers: ${written.source_metadata.source_layers.join(", ")}`);console.log("Foreign-script validation: PASSED");console.log("Constitutional-reference validation: PASSED");console.log("Source-provenance validation: PASSED");console.log("Final JSON re-read validation: PASSED");console.log("==========================================")})().catch(error=>{console.error("");console.error("==========================================");console.error("CONSTITUTION 365 GENERATION FAILED");console.error("==========================================");console.error(error?.stack||error?.message||error);console.error("==========================================");process.exit(1)});
