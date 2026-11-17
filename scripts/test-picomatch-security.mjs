import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const pm=require('picomatch');
const root=resolve(import.meta.dirname,'..');
const installed=dirname(require.resolve('picomatch/package.json'));
const manifest=JSON.parse(readFileSync(resolve(root,'vendor/picomatch/PROVENANCE.json')));
const sha=content=>createHash('sha256').update(content).digest('hex');

// npm audit cannot independently certify a local backport. These tests must run
// before the unchanged audit gate in BOTH workflows, including master builds.
test('every Vite/glob consumer resolves the reviewed local patch',()=>{
  assert.equal(require('picomatch/package.json').version,'4.0.7-jd.1');
  const viteRequire=createRequire(require.resolve('vite/package.json'));
  const tinyRequire=createRequire(viteRequire.resolve('tinyglobby'));
  const fdirRequire=createRequire(tinyRequire.resolve('fdir'));
  for(const consumer of [require,viteRequire,tinyRequire,fdirRequire]){
    assert.equal(realpathSync(consumer.resolve('picomatch')),realpathSync(require.resolve('picomatch')));
    assert.equal(realpathSync(consumer.resolve('picomatch/lib/parse')),realpathSync(require.resolve('picomatch/lib/parse')));
  }
  const lock=JSON.parse(readFileSync(resolve(root,'package-lock.json')));
  const copies=Object.entries(lock.packages).filter(([name])=>name.endsWith('node_modules/picomatch'));
  assert.equal(copies.length,1,'no unpatched nested registry copy');
  assert.equal(copies[0][1].resolved,'file:vendor/picomatch');
  const pkg=JSON.parse(readFileSync(resolve(root,'package.json')));
  assert.equal(pkg.overrides.picomatch,'$picomatch');
});

test('vendored and installed runtime files match the reviewed provenance hashes',()=>{
  for(const [file,record] of Object.entries(manifest.files)){
    assert.equal(sha(readFileSync(resolve(root,'vendor/picomatch',file))),record.patchedSha256,file);
    if(file==='index.js'||file==='posix.js'||file==='LICENSE'||file.startsWith('lib/')){
      assert.equal(sha(readFileSync(resolve(installed,file))),record.patchedSha256,`installed ${file}`);
    }
    if(file!=='lib/parse.js'&&file!=='package.json')assert.equal(record.patchedSha256,record.upstreamSha256,`unmodified upstream ${file}`);
  }
});

const patterns=['+(*)','*(*)','+(*a)','*(*a)','+(a*)','*(a*)','+(**a)','+(*?a)','+(*[ab])','+(@(*a))','+({a,*b})','+(*a|b)','prefix/+(*a).js','+(*(?a))','+([*a)','+([[]*a)','+([[:alpha:]]*a)'];
for(const pattern of patterns)test(`repeated wildcard is literalized: ${pattern}`,()=>{
  for(const options of [{},{fastpaths:false},{capture:true},{dot:true},{windows:true},{maxExtglobRecursion:false},{maxExtglobRecursion:100}]){
    const re=pm.makeRe(pattern,options);
    assert.equal(re.test(pattern),true,`literal match: ${re}`);
    assert.equal(pm.isMatch('a'.repeat(100)+'!',pattern,options),false);
  }
});

test('advisory payloads terminate in isolated, bounded child processes',()=>{
  for(const entry of ['picomatch','picomatch/posix','picomatch/lib/picomatch']){
    const script=`const assert=require('node:assert/strict');const pm=require(${JSON.stringify(entry)});for(const g of ${JSON.stringify(patterns)})for(const opts of [{},{maxExtglobRecursion:false}]){const subject='a'.repeat(10000)+'!';assert.equal(pm(g,opts)(subject),false);assert.equal(pm.makeRe(g,opts).test(subject),false);}`;
    const result=spawnSync(process.execPath,['-e',script],{cwd:root,encoding:'utf8',timeout:5000,killSignal:'SIGKILL'});
    assert.equal(result.error,undefined,`${entry}: ${result.error}`);
    assert.equal(result.status,0,result.stderr);
  }
});

test('ordinary Vite glob patterns and safe extglobs keep their semantics',()=>{
  const cases=[
    ['src/App.jsx','**/*.{jsx,tsx}',true],['src/App.js','**/*.{jsx,tsx}',false],
    ['src/pages/settings.jsx','src/**/*.jsx',true],['src/.hidden.jsx','src/**/*.jsx',false],
    ['src/App.test.jsx','**/!(*.test).jsx',false],['src/App.jsx','**/!(*.test).jsx',true],
    ['src/a.ts','**/*.@(js|ts)',true],['abab','+(ab)',true],['abc','+(ab)',false],
    ['abba','+(a|b)',true],['abc','+(a|b)',false],['aaa','+(*(a))',true],
    ['*a*a','+(\\*a)',true],['*a*a','+("*a")',true],['**','+([*])',true],
    ['ab','+(?)',false], // upstream currently treats a leading ? literally
    ['file.js','*.js',true],['file.jsx','*.js',false],
  ];
  for(const [subject,pattern,expected] of cases)assert.equal(pm.isMatch(subject,pattern),expected,`${pattern} vs ${subject}`);
  assert.equal(pm.isMatch('src/.hidden.jsx','src/**/*.jsx',{dot:true}),true);
  assert.equal(pm.isMatch('src\\App.jsx','src/*.jsx',{windows:true}),true);
});

test('CI keeps the audit gate and verifies the local patch before auditing',()=>{
  for(const file of ['ci.yml','verify.yml']){
    const source=readFileSync(resolve(root,'.github/workflows',file),'utf8');
    const patch=source.indexOf('run: npm run test:dependency-security');
    const audit=source.indexOf('run: npm audit --audit-level=high');
    assert.ok(patch>=0&&audit>patch,file);
    if(file==='ci.yml'){
      assert.ok(source.includes("- 'vendor/picomatch/**'"));
      assert.ok(source.includes("- '.npmrc'"));
    }
    assert.doesNotMatch(source,/continue-on-error:\s*true|npm audit[^\n]*(?:\|\|\s*true|--omit)/);
  }
});
