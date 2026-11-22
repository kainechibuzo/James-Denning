// Curated starter skills for the JD skills dashboard, packaged from
// Anthropic's public skills repository (https://github.com/anthropics/skills).
// Instruction and reference text only: upstream executable scripts were
// intentionally omitted because JD records package files as inert attachments
// and never executes, installs or fetches package content. Each archive is
// re-inspected by the secure import pipeline on import and still requires an
// independent administrator review before publication.
export const STARTER_SKILLS_SOURCE = "github.com/anthropics/skills · Apache-2.0";
export const STARTER_SKILLS = Object.freeze([
  {id:"xlsx", file:"xlsx.zip", name:"xlsx", category:"documents",
   title:"Spreadsheet workbooks (XLSX)",
   blurb:"Create, edit, clean and analyse .xlsx/.csv workbooks: formulas, formatting, charts and data restructuring guidance."},
  {id:"docx", file:"docx.zip", name:"docx", category:"documents",
   title:"Word documents (DOCX)",
   blurb:"Create and edit professional Word documents: tables of contents, headings, tracked changes and templates."},
  {id:"pdf", file:"pdf.zip", name:"pdf", category:"documents",
   title:"PDF processing",
   blurb:"Extract text and tables, merge, split, fill forms and OCR scanned PDFs — instruction and reference guidance."},
  {id:"pptx", file:"pptx.zip", name:"pptx", category:"documents",
   title:"Presentations (PPTX)",
   blurb:"Create and edit slide decks, work with templates and layouts, and extract presentation text."},
  {id:"internal-comms", file:"internal-comms.zip", name:"internal-comms", category:"communications",
   title:"Internal communications",
   blurb:"Write status reports, leadership updates, newsletters and FAQs in consistent company formats."},
  {id:"brand-guidelines", file:"brand-guidelines.zip", name:"brand-guidelines", category:"communications",
   title:"Brand guidelines",
   blurb:"Apply brand colours, typography and visual standards to artifacts that need a consistent look."},
].map(pkg=>Object.freeze({...pkg})));

export const findStarterSkill = id => STARTER_SKILLS.find(pkg=>pkg.id===id)||null;
