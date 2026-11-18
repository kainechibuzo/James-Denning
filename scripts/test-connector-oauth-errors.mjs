import test from 'node:test';
import assert from 'node:assert/strict';
import {connectorSignInError} from '../src/connectors/oauth-errors.mjs';
for(const message of ['Failed to send a request to the Edge Function','Failed to fetch','NetworkError'])test(`actionable transport error: ${message}`,async()=>{
 const result=await connectorSignInError({message});assert.match(result,/could not reach/);assert.match(result,/retry/);assert.match(result,/do not need an API key/);assert.doesNotMatch(result,/not deployed/);
});
for(const [status,pattern] of [[401,/session has expired/],[403,/review your access/],[404,/not deployed/],[503,/temporarily unavailable/],[400,/could not be completed/]])test(`HTTP ${status} is explained without raw diagnostics`,async()=>{
 const result=await connectorSignInError({context:{status},message:'raw diagnostic secret'});assert.match(result,pattern);assert.doesNotMatch(result,/raw diagnostic secret/);
});
test('application errors and generic fallback remain visible',async()=>{
 assert.equal(await connectorSignInError(null,{error:'Provider setup required'}),'Provider setup required');assert.match(await connectorSignInError(),/try again/);
});
