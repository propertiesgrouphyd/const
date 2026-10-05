const fs=require("fs"),path=require("path");const DAY=Number(process.env.DAY||0),ROOT=process.cwd(),DATA=path.join(ROOT,"data"),SYLLABUS=JSON.parse(fs.readFileSync(path.join(DATA,"syllabus.json"),"utf8")),SOURCES=JSON.parse(fs.readFileSync(path.join(DATA,"constitutional-sources.json"),"utf8"));if(!Number.isInteger(DAY)||DAY<1||DAY>365)throw new Error("DAY must be an integer between 1 and 365");const s=SYLLABUS.find(x=>Number(x.day)===DAY),r=SOURCES.days?.[String(DAY)];if(!s)throw new Error(`Syllabus entry not found for day ${DAY}`);if(!r)throw new Error(`Constitutional source not found for day ${DAY}`);const prompt=`You are the lead Telugu constitutional educator and senior factual editor for CONSTITUTION 365, a premium public-education program by Vidhwaan. Create Day ${DAY} for ordinary citizens, children, students, workers, parents, professionals and senior citizens. The purpose is deep understanding, not exam coaching. The reader should finish thinking: "ఇది నాకు ఇంత సులభంగా ఎవరూ చెప్పలేదు."

WRITE IN NATIVE TELUGU:
Use natural, modern, precise, grammatically correct Telugu written by an excellent Telugu educator. Do NOT translate English sentence-by-sentence. Avoid artificial Telugu, machine-translation patterns, unnecessary Sanskritized wording, motivational filler, repetition, exaggerated language and textbook-like exam language. Use short and medium-length sentences. Explain difficult terms immediately in simple Telugu. Keep the writing warm, clear, intelligent and memorable.

TODAY'S SYLLABUS:
Day: ${s.day}
Title: ${s.title}
Stage: ${s.stage}
Focus: ${s.focus}

AUTHORITATIVE SOURCE FOR THIS DAY:
Articles: ${JSON.stringify(r.articles||[])}
Parts: ${JSON.stringify(r.parts||[])}
References: ${JSON.stringify(r.references||[])}

NON-NEGOTIABLE FACTUAL RULES:
1. The supplied syllabus and authoritative source are the boundaries of this lesson.
2. Never invent an Article, Part, Schedule, constitutional power, constitutional procedure, institution, date, person, event, amendment, historical fact or legal claim.
3. Never attach an Article or Part merely because it sounds relevant.
4. If the supplied source does not support a specific constitutional provision, do not invent one.
5. Clearly distinguish:
   - what the Constitution itself provides;
   - what an ordinary law provides;
   - what courts have interpreted;
   - what is only a general democratic or explanatory principle.
6. Never present a general principle, analogy, interpretation or ordinary-law rule as though it were directly written in the Constitution.
7. Every historical name, date, event and claim must be supported by the supplied source. If the source does not support a historical detail, omit it rather than guessing.
8. Do not use "social contract", "everyone agreed", "renewed agreement", or similar claims unless the supplied source explicitly supports them.
9. Do not describe the Constitution as instructions telling every citizen how to live their personal life.
10. Do not claim that the Constitution directly guarantees, controls or requires something unless the supplied source supports that statement.
11. Analogies are teaching devices only. Clearly keep them separate from constitutional facts.
12. Do not add outside facts merely to make the lesson appear richer.
13. Accuracy is more important than quantity.

LESSON:
Create one complete lesson about THIS DAY'S topic only. Explain the central idea deeply but simply. Do not drift into unrelated constitutional topics. Begin naturally and differently from other days. A small everyday situation, question, comparison, thought experiment, dialogue-like example or story may be used when genuinely useful, but never create fictional constitutional facts.

The lesson should:
- explain what the topic actually means;
- explain the constitutional idea or source-supported facts;
- make the idea understandable to a normal person;
- use concrete everyday examples where appropriate;
- explain why the topic matters;
- address realistic misunderstandings;
- avoid unnecessary legal jargon;
- never turn into exam notes;
- never repeat the title as filler;
- never mention AI, Groq, this prompt, the syllabus, generation or internal instructions.

IMPORTANT:
Do not force a constitutional Article into a conceptual topic if the source does not provide one.
Do not make broad claims about courts, elections, government departments, citizens, rights, duties or administration unless supported by the source.
Do not say "the Constitution says" unless the statement is actually supported by the supplied constitutional source.

EXAMPLES:
Provide several useful examples that genuinely clarify THIS topic. Examples may be everyday situations, but never let an analogy be mistaken for an actual constitutional rule.

WHY IT MATTERS:
Explain practical significance without exaggeration or unsupported claims.

COMMON MISUNDERSTANDING:
Identify a realistic misunderstanding specifically related to THIS day's topic and correct it using only supported facts.

REFLECTION:
Give one meaningful Telugu question that makes the reader connect THIS topic with real life. It must not introduce an unsupported fact.

MCQs:
Create EXACTLY 5 high-quality MCQs based strictly on the lesson and supplied source.
Each MCQ must have EXACTLY 4 distinct options.
Each must have exactly ONE clearly defensible correct answer.
Test understanding, application and misconception-checking rather than meaningless memorization.
Every answer must be directly supported by the lesson/source.
Do not require outside knowledge.
Do not create trick questions.
Do not use ambiguous wording.
Do not make two options partly correct.
The answer field MUST exactly match one complete option.
The explanation must explain why the answer is correct in clear Telugu and, when useful, why the tempting alternative is wrong.
Vary the position of the correct answer across the 5 questions.

FINAL INTERNAL QUALITY REVIEW:
Before returning JSON, silently review every factual statement against the supplied syllabus and authoritative source. Remove anything unsupported, exaggerated, ambiguous or potentially misleading. Check every historical detail. Check every constitutional claim. Check every MCQ and ensure its answer is unambiguously supported by the lesson/source. Check Telugu grammar and naturalness. Make the final result read like it was written and carefully edited by a highly knowledgeable native Telugu constitutional educator.

OUTPUT:
Return ONLY valid JSON. No Markdown fences. No commentary before or after JSON.
Use exactly this structure:
{"day":${DAY},"title":${JSON.stringify(s.title)},"stage":${JSON.stringify(s.stage)},"focus":${JSON.stringify(s.focus)},"lesson":"","examples":[],"why_it_matters":"","common_misunderstanding":"","mcqs":[{"question":"","options":["","","",""],"answer":"","explanation":""}],"constitutional_reference":{"articles":[],"parts":[],"references":[]},"reflection":""}

The constitutional_reference arrays MUST reproduce the supplied authoritative source exactly and must not be altered.
lesson must be substantial.
examples must contain at least 3 useful examples when the topic permits.
why_it_matters must be substantial.
common_misunderstanding must be substantial.
reflection must be one meaningful question.
Keep user-facing content in Telugu except unavoidable official constitutional names or technical terms.
Ensure valid JSON escaping and no trailing commas.`;const validate=x=>{if(!x||typeof x!=="object")throw new Error("Generated result is not an object");if(Number(x.day)!==DAY)throw new Error("Generated day mismatch");for(const k of["title","stage","focus","lesson","why_it_matters","common_misunderstanding","reflection"])if(typeof x[k]!=="string"||!x[k].trim())throw new Error(`Missing or empty field: ${k}`);if(x.lesson.trim().length<500)throw new Error("Lesson is too short");if(!Array.isArray(x.examples)||x.examples.length<3||x.examples.some(v=>typeof v!=="string"||!v.trim()))throw new Error("At least 3 valid examples are required");if(x.why_it_matters.trim().length<100)throw new Error("why_it_matters is too short");if(x.common_misunderstanding.trim().length<70)throw new Error("common_misunderstanding is too short");if(!Array.isArray(x.mcqs)||x.mcqs.length!==5)throw new Error("Exactly 5 MCQs are required");x.mcqs.forEach((m,i)=>{if(!m||typeof m.question!=="string"||!m.question.trim())throw new Error(`MCQ ${i+1}: invalid question`);if(!Array.isArray(m.options)||m.options.length!==4||m.options.some(o=>typeof o!=="string"||!o.trim()))throw new Error(`MCQ ${i+1}: exactly 4 valid options required`);if(new Set(m.options.map(o=>o.trim())).size!==4)throw new Error(`MCQ ${i+1}: options must be distinct`);if(typeof m.answer!=="string"||!m.answer.trim()||!m.options.includes(m.answer))throw new Error(`MCQ ${i+1}: answer must exactly match one option`);if(typeof m.explanation!=="string"||m.explanation.trim().length<20)throw new Error(`MCQ ${i+1}: explanation is too short`)});return x};const generate=async()=>{const key=process.env.GROQ_API_KEY;if(!key)throw new Error("GROQ_API_KEY is missing");let last;for(let i=1;i<=3;i++)try{const q=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({model:process.env.GROQ_MODEL||"openai/gpt-oss-120b",temperature:.25,max_tokens:12000,response_format:{type:"json_object"},messages:[{role:"system",content:"You are a highly accurate Indian constitutional educator, constitutional fact-checker and native Telugu editor. Accuracy, source fidelity and natural Telugu are more important than verbosity. Return only valid JSON."},{role:"user",content:prompt}]})});if(!q.ok)throw new Error(`Groq HTTP ${q.status}: ${await q.text()}`);const j=await q.json(),c=j?.choices?.[0]?.message?.content;if(!c)throw new Error("Groq returned no content");return validate(JSON.parse(c))}catch(e){last=e;if(i<3)await new Promise(x=>setTimeout(x,2500*i))}throw last};(async()=>{console.log(`Generating Constitution 365 Day ${DAY}...`);const x=await generate();x.day=DAY;x.title=s.title;x.stage=s.stage;x.focus=s.focus;x.constitutional_reference={articles:r.articles||[],parts:r.parts||[],references:r.references||[]};const out=path.join(DATA,`day-${String(DAY).padStart(3,"0")}.json`);fs.mkdirSync(DATA,{recursive:true});fs.writeFileSync(out,JSON.stringify(x,null,2)+"\n","utf8");console.log(`Created: ${out}`);console.log(`Day ${DAY} generated successfully with exactly ${x.mcqs.length} MCQs.`)})().catch(e=>{console.error("GENERATION FAILED:",e.message);process.exit(1)});
