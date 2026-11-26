/** Versioned wire contract, shared by the worker, authenticated endpoint and React.
 * No execution authority comes from model output. Unknown/invalid blocks reject
 * the entire envelope; legacy Markdown stays supported. No HTML is accepted. */
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = (x, max = 2000) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
const id = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(x) && !['__proto__','constructor','prototype'].includes(x);
const unique = xs => new Set(xs).size === xs.length;
const textList = (xs, maxItems = 8, maxLen = 240) => Array.isArray(xs) && xs.length <= maxItems && xs.every(x => text(x, maxLen));
function optionMeta(x) {
  return (x.description === undefined || text(x.description, 600))
    && (x.subtitle === undefined || text(x.subtitle, 200))
    && (x.badge === undefined || text(x.badge, 60))
    && (x.recommended === undefined || typeof x.recommended === 'boolean')
    && (x.highlights === undefined || textList(x.highlights, 6, 200))
    && (x.rateLabel === undefined || text(x.rateLabel, 80))
    && (x.estTime === undefined || text(x.estTime, 80))
    && (x.estCost === undefined || text(x.estCost, 80));
}
function options(xs) {
  return Array.isArray(xs) && xs.length >= 2 && xs.length <= 30 && unique(xs.map(x => x?.value)) && xs.every(x => object(x) && text(x.label, 200) && text(x.value, 200) && optionMeta(x));
}
export function validateResponse(value, { allowOperational = true } = {}) {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.blocks) || !value.blocks.length || value.blocks.length > 12) return null;
  if (!unique(value.blocks.map(b => b?.id))) return null;
  if(value.context!==undefined&&(!object(value.context)||!Array.isArray(value.context.components)||value.context.components.length>3||!unique(value.context.components)||value.context.components.some(v=>!['tasks','departments','execution'].includes(v))))return null;
  for (const b of value.blocks) {
    if (!object(b) || !id(b.id)) return null;
    if (b.type === 'message') {
      if (!text(b.content, 60000) || (b.variant !== undefined && !['plain','callout'].includes(b.variant))) return null;
    } else if (b.type === 'choice') {
      if (!text(b.question) || !options(b.options) || typeof b.multiple !== 'boolean' || (b.subtitle !== undefined && !text(b.subtitle, 400)) || (b.variant !== undefined && !['standard','specialist_teams'].includes(b.variant)) || (b.presentation !== undefined && !['list','dropdown'].includes(b.presentation)) || (b.multiple && b.presentation === 'dropdown') || (b.allowCustom !== undefined && typeof b.allowCustom !== 'boolean') || (b.customLabel !== undefined && !text(b.customLabel, 120)) || (b.submitLabel !== undefined && !text(b.submitLabel, 80))) return null;
    } else if (b.type === 'form') {
      if (!text(b.title, 300) || (b.subtitle !== undefined && !text(b.subtitle, 400)) || !Array.isArray(b.fields) || !b.fields.length || b.fields.length > 16 || !unique(b.fields.map(f => f?.id))) return null;
      for (const f of b.fields) {
        if (!object(f) || !id(f.id) || !text(f.label, 200) || !['text','textarea','number','select','date'].includes(f.type) || typeof f.required !== 'boolean') return null;
        if (f.type === 'select' && !options(f.options)) return null;
        if (f.description !== undefined && !text(f.description, 600)) return null;
        if (f.min !== undefined && !Number.isFinite(f.min) || f.max !== undefined && !Number.isFinite(f.max)) return null;
        if (f.min !== undefined && f.max !== undefined && f.min > f.max) return null;
      }
    } else if (b.type === 'connector_prompt') {
      if (!id(b.connectorId) || (b.reason !== undefined && !text(b.reason, 600)) || (b.capabilities !== undefined && !textList(b.capabilities, 6, 180))) return null;
    } else if (b.type === 'approval') {
      if (!allowOperational || !text(b.actionId, 100) || !text(b.description)) return null;
    } else if (b.type === 'operational_result') {
      if (!allowOperational || !text(b.title, 300) || !['persisted_records','verified_tool_result'].includes(b.source) || !['completed','running','failed','pending','awaiting_approval'].includes(b.status) || !object(b.data) || Object.keys(b.data).length > 30 || !Object.entries(b.data).every(([k,v]) => text(k, 200) && ['string','number','boolean'].includes(typeof v) && String(v).length <= 2000)) return null;
    } else return null;
  }
  return value;
}
export function responseText(response) {
  return response.blocks.map(b => b.type === 'message' ? b.content : b.type === 'choice' ? b.question + '\n' + b.options.map(o => '- ' + o.label + (o.description ? ': ' + o.description : '')).join('\n') : b.type === 'form' ? b.title + '\n' + b.fields.map(f => '- ' + f.label).join('\n') : b.type === 'connector_prompt' ? 'Suggested connector: ' + b.connectorId + (b.reason ? ' — ' + b.reason : '') : b.description || b.title).join('\n\n');
}
const candidate = raw => /^\s*(?:```(?:jd-response|json)?\s*)?\{\s*"(?:version|blocks)"/.test(raw);
export function decodeResponse(raw, opts = {}) {
  const content = String(raw || '');
  if (!candidate(content)) return { content, response: null };
  try {
    const response = validateResponse(JSON.parse(content.trim().replace(/^```(?:jd-response|json)?\s*/, '').replace(/\s*```$/, '')), opts);
    if (response) return { content: responseText(response), response };
  } catch { /* Incomplete or malformed output must never become a control. */ }
  return { content: 'JD could not display this interactive response. Please ask JD to rephrase it as a message.', response: null };
}
export function streamText(raw) {
  // Buffer envelope prefixes as well as complete JSON. Nothing interactive is
  // published until the worker commits a fully validated final response.
  const s = String(raw || '');
  return /^\s*(?:\{|`)/.test(s) ? '' : s;
}
export function validateAnswer(block, value) {
  if (block?.type === 'choice') {
    if (!Array.isArray(value) || !value.length || !unique(value) || (!block.multiple && value.length !== 1) || value.some(v => !block.options.some(o => o.value === v) && !(block.allowCustom && typeof v === 'string' && v.startsWith('custom:') && v.length > 7 && v.length <= 507))) throw Error('Choose a valid option.');
    return value;
  }
  if (block?.type !== 'form' || !object(value) || Object.keys(value).some(k => !block.fields.some(f => f.id === k))) throw Error('Invalid form answer.');
  const result = Object.create(null);
  for (const f of block.fields) {
    const v = value[f.id];
    if (v === undefined || v === '' || v === null) { if (f.required) throw Error(f.label + ' is required.'); continue; }
    if (!['string','number'].includes(typeof v) || String(v).length > 2000) throw Error(f.label + ' is invalid.');
    if (typeof v === 'string' && !v.trim()) { if (f.required) throw Error(f.label + ' is required.'); continue; }
    if (f.type === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) throw Error(f.label + ' is outside the allowed range.');
      result[f.id] = n;
    } else {
      if (f.type === 'select' && !f.options.some(o => o.value === v)) throw Error('Choose a valid ' + f.label + '.');
      if (f.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0,10) !== v)) throw Error('Enter a valid date.');
      result[f.id] = String(v).trim();
    }
  }
  return result;
}
export function answerText(block, value) {
  const answer = validateAnswer(block, value);
  return block.type === 'choice' ? block.question + '\nMy selection: ' + answer.map(v => block.options.find(o => o.value === v)?.label || ('Other: ' + v.slice(7))).join(', ') : block.title + '\n' + block.fields.filter(f => Object.hasOwn(answer, f.id)).map(f => f.label + ': ' + (f.type === 'select' ? f.options.find(o => o.value === answer[f.id]).label : answer[f.id])).join('\n');
}
/** Legacy unconditional dashboards are deliberately not restored from history.
 * New worker attachments carry explicit per-response relevance metadata. */
export function contextualWorkspace(value) {
  if(value?.version!==1||value?.contextual!==true||value?.source!=='persisted_workspace_records'||!Array.isArray(value.blocks)||value.blocks.length>12)return null;
  for(const b of value.blocks){
    if(!object(b)||!['checklist','workflow','timeline','departments','evidence'].includes(b.type))return null;
    for(const key of ['items','steps','events'])if(b[key]!==undefined&&(!Array.isArray(b[key])||b[key].length>30||!b[key].every(object)))return null;
  }
  return value;
}
export const RESPONSE_INSTRUCTIONS = `Response interface protocol v1:
Use ordinary Markdown for explanations, facts, rhetorical questions and user-requested code (fenced with a language) or LaTeX ($inline$ or $$display$$). Never attach a dashboard merely because workspace records exist.
When you need essential missing user input to continue the active workflow, return ONLY a JSON envelope {"version":1,"blocks":[...]} (no surrounding prose). The application renders it; it is not user-visible source code. This protocol is an exception to the no-raw-JSON instruction.
Every block needs a unique stable id (letters, digits, underscore or hyphen, max 80).
Supported model blocks:
{"id":"intro","type":"message","content":"Markdown explanation","variant":"callout"}
{"id":"structure","type":"choice","question":"Which structure would you prefer?","subtitle":"Select one option to continue.","options":[{"label":"Flat","value":"flat","description":"Fewer management layers","recommended":true,"highlights":["Faster decisions","Direct ownership"]},{"label":"Functional","value":"functional","subtitle":"Grouped specialist teams"}],"multiple":false,"presentation":"list"}
Optional choice fields: subtitle, variant ("standard" or "specialist_teams"), submitLabel. Optional choice option fields: subtitle, badge, recommended (boolean), highlights (up to 6 short deliverable strings), rateLabel, estTime, estCost.
For multiple selections set multiple:true; for a single dropdown set presentation:"dropdown".
To allow a user-written answer on a choice, set allowCustom:true and optionally customLabel:"Something else". The UI adds a free-text field; the submitted answer is validated and returned as a normal answer prefixed internally with "custom:". Do not invent a fixed answer when the user may need to specify their own.
{"id":"identity","type":"form","title":"Name your business","fields":[{"id":"name","label":"Business name","type":"text","required":true}]}
Form field types: text, textarea, number (optional numeric min/max), select (options as above), date. Every field needs id, label, type, required boolean. Never request passwords, tokens or payment details.
{"id":"connect-github","type":"connector_prompt","connectorId":"github","reason":"Connect GitHub so JD can inspect authorised repository code.","capabilities":["Read selected repository files","Search repository source"]}
Use connector_prompt only when a task genuinely needs an external service from JD's connector directory that is not yet connected; never imply it is already connected or ask the user to paste credentials into chat.
For a genuinely relevant saved operational view, an envelope may also include top-level "context":{"components":["tasks","departments","execution"]} with only the needed components. This requests a tenant-scoped server read, not permission to execute. Do not request workspace cards for conceptual explanations or ordinary conversation.
Discovery and agent recommendations:
For a new, broad, multi-step or outcome-oriented request, do not jump straight into execution or a generic plan. Start by asking one focused objective question using a choice block with 3-6 useful options and allowCustom:true. Ask one question at a time; adapt each next question to the previous answer. If the request is already specific enough, do not add needless questions.
After understanding the objective and key constraints, recommend a small, relevant specialist team before delegation. Base recommendations ONLY on the currently registered and role-available specialist catalogue and deployment tool contract. For each recommended specialist explain its role, the task it would own, and why it fits; clearly distinguish available specialists from unavailable or merely suggested roles. Ask for confirmation before deploying the team. Never claim an agent is available unless the runtime catalogue confirms it, and never start deployment merely because you recommended it.
Ask only what is needed. Do not convert every question mark to an interaction. Follow-up answers arrive as validated user messages referring to the original question. Continue using that context; do not ask again unnecessarily. Components never grant authority, approve actions or prove execution. Approval and operational results are supplied only by authenticated server systems.`;
