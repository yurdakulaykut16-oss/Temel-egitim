import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['src/memory.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {schedule,prioritize,loadReviews}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
const day=86400000, now=1700000000000;
test('remembered reviews advance through bounded spaced intervals',()=>{
 let previous;
 for(const days of [1,3,7,14,30,30]){const result=schedule(previous,true,now);assert.equal(result.due,now+days*day);previous=result}
});
test('forgotten and wrong answers restart review',()=>{
 assert.deepEqual(schedule({stage:4,due:now,reviewed:now},false,now),{stage:0,due:now+600000,reviewed:now});
 assert.deepEqual(prioritize(now),{stage:0,due:now,reviewed:now});
});
test('stored review data is checked before use',()=>{
 assert.deepEqual(loadReviews('{'),{});
 assert.deepEqual(loadReviews('[]'),{});
 assert.deepEqual(loadReviews(JSON.stringify({'0-0':{stage:0,due:now,reviewed:now},bad:{stage:99,due:0,reviewed:0}})),{'0-0':{stage:0,due:now,reviewed:now}});
});
