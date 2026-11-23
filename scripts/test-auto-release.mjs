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
  assert.match(workflow, /on:\s*\n\s*push:\s*\n\s*branches:\s*\n\s*- master/);
  assert.match(workflow, /workflow_dispatch:\s*\{\}/);
  assert.doesNotMatch(workflow, /branches:\s*\[[^\]]*,/);
});

test('the workflow token only needs to dispatch a workflow', () => {
  assert.match(workflow, /actions:\s*write/);
  assert.match(workflow, /contents:\s*read/);
  assert.doesNotMatch(workflow, /administration:/);
  assert.doesNotMatch(workflow, /uses: actions\/checkout/); // pure dispatch: no repo content is checked out
});

test('the release approval evidence is carried as dispatch inputs, not variable writes', () => {
  assert.match(workflow, /approved_sha="\$\{\{ steps\.pr\.outputs\.sha \}\}"/);
  assert.match(workflow, /approval_reference="https:\/\/github\.com\/\$\{\{ github\.repository \}\}\/pull\/\$\{\{ steps\.pr\.outputs\.number \}\}"/);
  assert.match(workflow, /staging_verified_sha="\$\{\{ steps\.pr\.outputs\.sha \}\}"/);
  assert.match(workflow, /commits\/\$SHA\/pulls/);
  // deploy.yml honours the inputs and still falls back to the reviewed variables.
  assert.match(deploy, /inputs\.approved_sha \|\| vars\.JD_BACKEND_RELEASE_APPROVED_SHA/);
  assert.match(deploy, /inputs\.approval_reference \|\| vars\.JD_BACKEND_APPROVAL_REFERENCE/);
  assert.match(deploy, /inputs\.staging_verified_sha \|\| vars\.JD_BACKEND_STAGING_VERIFIED_SHA/);
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
