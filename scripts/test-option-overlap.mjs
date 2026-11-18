import test from 'node:test';
import assert from 'node:assert/strict';
import {optionOverlapRatio} from '../server/option-overlap.mjs';
const norm = s => (typeof s === 'string' ? s : '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
function reference(a, b) {
 const aa=Array.isArray(a?.options)?a.options:[], bb=Array.isArray(b?.options)?b.options:[];
 if(!aa.length||!bb.length)return 0;
 const set=new Set(aa.map(norm));
 let n=0;
 for(const o of bb)if(set.has(norm(o)))n++;
 return n/Math.max(4,aa.length,bb.length);
}
test('örtüşme sonuçları 4/5 şıkta ve soğuk/sıcak önbellekte değişmez',()=>{
 const sparse=['a','b','c','d']; delete sparse[3];
 const cases=[{},null,{options:[]},{options:['İlke','Kuvvet','Sürat','Dayanıklılık']},{options:['ilke!','kuvvet','Farklı','başka','son']},{options:['a','a','b','c']},{options:sparse},{options:[null,undefined,2,'b']}];
 for(const a of cases)for(const b of cases)for(let i=0;i<2;i++)assert.equal(optionOverlapRatio(a,b),reference(a,b));
});
test('yerinde seçenek değişikliği/silme/ekleme yeni sonuç verir',()=>{
 const a={options:['a','b','c','d']}, b={options:['a','b','c','e']};
 assert.equal(optionOverlapRatio(a,b),0.75);
 b.options[3]='d'; assert.equal(optionOverlapRatio(a,b),1);
 a.options[0]='x'; assert.equal(optionOverlapRatio(a,b),0.75);
 b.options.push('x'); assert.equal(optionOverlapRatio(a,b),0.8);
 delete b.options[2]; assert.equal(optionOverlapRatio(a,b),reference(a,b));
 b.options[2]=undefined; assert.equal(optionOverlapRatio(a,b),reference(a,b));
});
