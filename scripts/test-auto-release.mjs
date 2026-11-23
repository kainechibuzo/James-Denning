// Static contract for the merge-to-master auto release workflow: it must
// trigger only on master, carry the permissions it needs to record the
// approval variables and dispatch the deploy, set exactly the three reviewed
// variables, dispatch the reviewed workflow with the required inputs, and
// honour the kill switch. This keeps the automation honest without running it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow = readFileSync('.github/workflows/auto-release.yml', 'utf8');
const deploy = readFileSync('.github/workflows/deploy.yml', 'utf8');

test('auto release triggers on master pushes and manual re-runs only', () => {
  assert.match(workflow, /on:\s*\n\s*push:\s*\n\s*branches:\s*\[master\]/);
  assert.match(workflow, /workflow_dispatch:\s*\{\}/);
  assert.doesNotMatch(workflow, /branches:\s*\[[^\]]*,/);
});

test('the workflow token can record variables and dispatch the deploy', () => {
  assert.match(workflow, /administration:\s*write/);
  assert.match(workflow, /actions:\s*write/);
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /persist-credentials:\s*false/);
});

test('the release approval variables are recorded for the merged commit', () => {
  for (const name of ['JD_BACKEND_RELEASE_APPROVED_SHA', 'JD_BACKEND_APPROVAL_REFERENCE', 'JD_BACKEND_STAGING_VERIFIED_SHA']) {
    assert.ok(workflow.includes(name), `missing ${name}`);
  }
  assert.match(workflow, /pull\/\$\{\{ steps\.pr\.outputs\.number \}\}/);
  assert.match(workflow, /commits\/\$SHA\/pulls/);
});

test('the dispatch uses the reviewed workflow with the exact release inputs', () => {
  assert.match(workflow, /gh workflow run deploy\.yml --ref master/);
  assert.match(workflow, /release_stage=production/);
  assert.match(workflow, /confirmation=deploy-reviewed-jd-backend/);
  assert.match(workflow, /deploy_functions=true/);
  // The deploy workflow still owns its own gates; nothing is bypassed.
  assert.match(deploy, /release_stage/);
  assert.match(deploy, /deploy-reviewed-jd-backend/);
  assert.match(deploy, /--yes/);
});

test('the owner keeps a kill switch and unresolved merges fail loudly', () => {
  assert.match(workflow, /JD_AUTO_RELEASE_DISABLED/);
  assert.match(workflow, /if: env\.AUTO_RELEASE_DISABLED == 'true'/);
  assert.match(workflow, /No reviewed pull request/);
  assert.match(workflow, /concurrency:/);
});
