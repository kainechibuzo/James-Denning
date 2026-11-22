// Offline verification of the committed starter skill packages: every archive
// in src/config/starter-skills.mjs must exist under public/skills/, pass the
// same inspector used by the secure import pipeline, and match its manifest.
// Nothing is executed; this only parses and hashes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {inspectSkillPackage} from '../supabase/functions/_shared/jd-skills-package.ts';
import {STARTER_SKILLS} from '../src/config/starter-skills.mjs';

test('the starter catalogue lists six curated packages with committed archives',()=>{
  assert.equal(STARTER_SKILLS.length,6);
  for(const pkg of STARTER_SKILLS){
    assert.ok(existsSync(`public/skills/${pkg.file}`),`${pkg.file} is committed`);
    assert.match(pkg.file,/^[a-z0-9-]+\.zip$/);
  }
});
for(const pkg of STARTER_SKILLS)test(`starter package ${pkg.id} passes the secure import inspector`,async()=>{
  const bytes=new Uint8Array(readFileSync(`public/skills/${pkg.file}`));
  const report=await inspectSkillPackage(bytes,{originalFilename:pkg.file});
  assert.equal(report.ok,true,`inspection succeeded: ${JSON.stringify(report.errors)}`);
  assert.equal(report.status,'validated','a clean starter package needs no forced review warnings');
  assert.equal(report.manifest.name,pkg.name);
  assert.equal(report.manifest.entrypoint,'SKILL.md');
  assert.equal(report.license.declared,'Apache-2.0');
  assert.equal(report.license.licenseFile,true);
  assert.equal(report.license.status,'declared_with_license_file');
  assert.ok(report.manifest.instructionText.length>=20,'instruction text present');
  assert.ok(report.manifest.fileCount>=2,'SKILL.md plus licence and packaging note');
  assert.deepEqual(report.manifest.files.filter(f=>f.role==='inert_asset'),[],'no executable assets are packaged');
  assert.deepEqual(report.manifest.tags,["anthropic","starter","jd-repackaged"]);
  assert.equal(report.manifest.category,pkg.category);
});
test('excluded upstream skills stay excluded',()=>{
  const ids=STARTER_SKILLS.map(pkg=>pkg.id);
  assert.ok(!ids.includes('skill-creator'),'skill-creator exceeds the 32k instruction budget');
  assert.ok(!ids.includes('doc-coauthoring'),'doc-coauthoring ships no licence file upstream');
});
