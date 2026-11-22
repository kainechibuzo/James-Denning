// Allowlisted autonomous-acquisition source index for the JD skills catalogue.
// Search never touches the network: it matches the requesting task against
// this curated, code-reviewed index of Anthropic's public skills repository
// (https://github.com/anthropics/skills, Apache-2.0). Acquisition fetches only
// the allowlisted repo at a pinned commit and repackages instruction text;
// scripts and binaries are never included and never executed.
export const AUTONOMOUS_SOURCE = Object.freeze({
  repo: 'anthropics/skills',
  ref: 'main',
  policy: 'jd-autonomous-v1',
  apiHost: 'api.github.com',
  archiveHost: 'codeload.github.com',
});

// Curated entry per upstream skills/<id> directory. Descriptions are the
// upstream SKILL.md descriptions (trimmed for multiline YAML). expectedMinutes
// is the JD source-index estimate used for per-run agentic-time confirmation.
const INDEX = Object.freeze([
  {id:'xlsx',category:'documents',expectedMinutes:20,keywords:['spreadsheet','xlsx','excel','workbook','formula','csv','chart','reconcile','ledger','budget'],description:'Create, edit, clean and analyse .xlsx/.csv workbooks: formulas, formatting, charts and data restructuring guidance.'},
  {id:'docx',category:'documents',expectedMinutes:20,keywords:['word','docx','document','template','contract','letter','track-changes','table-of-contents'],description:'Create and edit professional Word documents: tables of contents, headings, tracked changes and templates.'},
  {id:'pdf',category:'documents',expectedMinutes:30,keywords:['pdf','forms','ocr','merge','split','watermark','extract','scanned'],description:'Extract text and tables, merge, split, fill forms and OCR scanned PDFs — instruction and reference guidance.'},
  {id:'pptx',category:'documents',expectedMinutes:25,keywords:['powerpoint','pptx','slides','deck','presentation','pitch'],description:'Create and edit slide decks, work with templates and layouts, and extract presentation text.'},
  {id:'internal-comms',category:'communications',expectedMinutes:15,keywords:['status','report','newsletter','faq','leadership','update','comms','announcement','incident'],description:'Write status reports, leadership updates, newsletters and FAQs in consistent company formats.'},
  {id:'brand-guidelines',category:'communications',expectedMinutes:10,keywords:['brand','colours','colors','typography','visual','identity','style'],description:'Apply brand colours, typography and visual standards to artifacts that need a consistent look.'},
  {id:'frontend-design',category:'design',expectedMinutes:25,keywords:['ui','frontend','design','aesthetic','typography','layout','interface','web'],description:'Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one.'},
  {id:'canvas-design',category:'design',expectedMinutes:25,keywords:['poster','art','design','png','pdf','visual','graphic'],description:'Create original visual art and posters in .png and .pdf using design philosophy.'},
  {id:'theme-factory',category:'design',expectedMinutes:15,keywords:['theme','styling','colours','fonts','landing-page','slides','brand'],description:'Apply pre-set or on-the-fly colour and font themes to slides, docs, reports and landing pages.'},
  {id:'doc-coauthoring',category:'communications',expectedMinutes:30,keywords:['documentation','coauthor','spec','proposal','decision-doc','draft'],description:'Guide a structured workflow for co-authoring documentation, proposals, technical specs and decision docs.'},
  {id:'claude-api',category:'engineering',expectedMinutes:30,keywords:['claude','api','prompt','llm','integration','sdk'],description:'Guidance for building with the Claude API: prompts, tool use, batch processing and SDK integration patterns.'},
  {id:'mcp-builder',category:'engineering',expectedMinutes:40,keywords:['mcp','model-context-protocol','server','tools','api-integration'],description:'Guide for creating high-quality MCP servers that let LLMs interact with external services through well-designed tools.'},
  {id:'webapp-testing',category:'engineering',expectedMinutes:25,keywords:['testing','playwright','webapp','browser','e2e','debug','screenshots'],description:'Interact with and test local web applications using Playwright: verify functionality, debug and capture screenshots.'},
  {id:'web-artifacts-builder',category:'engineering',expectedMinutes:30,keywords:['react','tailwind','artifact','web','component','shadcn','frontend'],description:'Build elaborate multi-component web artifacts with React, Tailwind CSS and shadcn/ui.'},
  {id:'algorithmic-art',category:'design',expectedMinutes:20,keywords:['generative','art','p5js','algorithmic','creative','visual'],description:'Create algorithmic art with p5.js using seeded randomness and generative flow fields.'},
  {id:'skill-creator',category:'meta',expectedMinutes:40,keywords:['skill','authoring','evals','benchmark','package'],description:'Create, improve and evaluate skill packages for the JD skills catalogue.'},
  {id:'academy-guide',category:'learning',expectedMinutes:10,keywords:['learn','tutorial','course','academy','getting-started','how-to'],description:'Recommend matching courses, tutorials and use cases from Claude Academy when users ask how to use Claude.'},
  {id:'discernment-nudge',category:'quality',expectedMinutes:10,keywords:['review','verify','judgement','follow-up','accuracy','assumptions'],description:'Append clarifying follow-up questions and verification nudges before finalising substantive advice.'},
]);

export const AUTONOMOUS_SKILL_SOURCES = INDEX;

const ENTRY_FIELDS = Object.freeze(['id','category','expectedMinutes','keywords','description']);
for (const entry of INDEX) {
  for (const field of Object.keys(entry)) if (!ENTRY_FIELDS.includes(field)) throw Error(`Unexpected index field on ${entry.id}`);
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(entry.id)) throw Error(`Invalid index id ${entry.id}`);
  if (!['documents','communications','design','engineering','meta','learning','quality'].includes(entry.category)) throw Error(`Invalid category on ${entry.id}`);
  if (!Number.isInteger(entry.expectedMinutes) || entry.expectedMinutes < 5 || entry.expectedMinutes > 240) throw Error(`Invalid estimate on ${entry.id}`);
  if (entry.description.length < 12 || entry.description.length > 2000) throw Error(`Invalid description on ${entry.id}`);
  if (!Array.isArray(entry.keywords) || entry.keywords.length < 3) throw Error(`Invalid keywords on ${entry.id}`);
}

const STOP_WORDS = new Set(['this','that','with','from','have','needs','need','please','work','task','help','about','make','want','using','into','when','some','also','should','would','create','write']);

const tokenize = (task) => {
  const lower = task.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ');
  return [...new Set(lower.split(/\s+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w)))];
};

// Deterministic keyword scoring: exact id hits dominate, then keyword hits.
// Returns allowlisted candidates only, strongest first, bounded list.
export function matchSkillsForTask(task, limit = 5) {
  if (typeof task !== 'string' || task.trim().length < 4 || task.length > 2000) throw Error('A bounded task description is required to search the source catalogue.');
  const boundedLimit = Number.isInteger(limit) && limit > 0 && limit <= 10 ? limit : 5;
  const terms = tokenize(task);
  if (!terms.length) return [];
  const scored = [];
  for (const entry of INDEX) {
    let score = 0;
    if (terms.includes(entry.id)) score += 8;
    for (const term of terms) {
      if (entry.keywords.includes(term)) score += 3;
      else if (entry.keywords.some((k) => k.startsWith(term) || term.startsWith(k) && term.length >= 5)) score += 1;
      else if (entry.description.toLowerCase().includes(term) && term.length >= 5) score += 1;
    }
    if (score > 0) scored.push({score, entry});
  }
  scored.sort((a, b) => b.score - a.score || (a.entry.id < b.entry.id ? -1 : 1));
  return scored.slice(0, boundedLimit).map(({score, entry}) => ({
    id: entry.id,
    name: entry.id,
    category: entry.category,
    description: entry.description,
    score,
    expectedMinutes: entry.expectedMinutes,
    source: {repo: AUTONOMOUS_SOURCE.repo, ref: AUTONOMOUS_SOURCE.ref, path: `skills/${entry.id}`},
  }));
}

export function getAutonomousSourceEntry(id) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,60}$/.test(id)) return null;
  return INDEX.find((entry) => entry.id === id) || null;
}
