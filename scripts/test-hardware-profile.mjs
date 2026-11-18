import test from 'node:test';
import assert from 'node:assert/strict';
import {hardwareRunnerOptions} from '../server/hardware-profile.mjs';
import {createOllamaClient} from '../server/ollama-client.mjs';
test('kullanıcı profili elle ayarsız altı thread, 512 batch ve otomatik GPU kullanır',()=>{
 assert.deepEqual(hardwareRunnerOptions({}),{numThread:6,numBatch:512,numGpu:null});
 const client=createOllamaClient({base:'http://test.invalid',...hardwareRunnerOptions({})});
 assert.equal(client.snapshot().numThread,6);
 assert.equal(client.snapshot().numBatch,512);
 assert.equal(client.snapshot().numGpu,null);
});
test('açık ayarlar varsayılanları ezer, boş değerler profil kullanır',()=>{
 assert.deepEqual(hardwareRunnerOptions({TEMPO_OLLAMA_NUM_THREADS:'4',TEMPO_OLLAMA_NUM_BATCH:'256',TEMPO_OLLAMA_NUM_GPU:'0'}),{numThread:'4',numBatch:'256',numGpu:'0'});
 assert.deepEqual(hardwareRunnerOptions({TEMPO_OLLAMA_NUM_THREADS:' ',TEMPO_OLLAMA_NUM_BATCH:''}),hardwareRunnerOptions({}));
});
