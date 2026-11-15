import {books} from '../src/data';
import {extra} from '../src/extra';
import {scenarios} from '../src/scenarios';
import {practice} from '../src/practice';
import {reinforcement} from '../src/reinforcement';
import {unique} from '../src/unique';
import {advanced} from '../src/advanced';
import {newQuestions} from '../src/newQuestions';
import {bookQuestions} from '../src/bookNotes';
import {challenge} from '../src/challenge';
import {bmiExercises} from '../src/calculations';
import {readFileSync} from 'node:fs';
import groundingIndex from '../src/groundingIndex.json';
const norm=(s:string)=>s.toLocaleLowerCase('tr-TR').replace(/[^a-zçğıöşü0-9]+/g,' ').trim();
let errors:string[]=[];let count=0;let repeatedStems=0;let answerGroups=0;let seenStems=new Map<string,string>();
books.forEach((b,bi)=>b.units.forEach((u,ui)=>{
 const id=`${bi}-${ui}`;
 const lines=[...(extra[bi]?.[ui]||[]),...(scenarios[bi]?.[ui]||[]),...(practice[bi]?.[ui]||[]),reinforcement[bi]?.[ui],...(unique[id]?.questions||[]),...(advanced[id]?.questions||[]),...(newQuestions[id]?.questions||[]),...(challenge[id]||[]),...(bookQuestions[id]||[])];
 const items=[{question:u.question,answer:u.answer,wrong:u.wrong,explanation:u.key},...lines.map(line=>{if(!line){errors.push(`${id}: eksik soru`);return {question:'',answer:'',wrong:[],explanation:''}}const parts=line.split('|');if(parts.length!==6)errors.push(`${id}: ${parts.length} alan: ${line}`);return {question:parts[0],answer:parts[1],wrong:parts.slice(2,5),explanation:parts[5]}})];
 const answers=new Set<string>();
 for(const item of items){count++;if(!item.question||!item.answer||!item.explanation||item.wrong.length!==3||item.wrong.some(x=>!x))errors.push(`${id}: eksik alan ${item.question}`);const opts=[item.answer,...item.wrong].map(norm);if(new Set(opts).size!==4)errors.push(`${id}: tekrar eden seçenek ${item.question}`);const stem=norm(item.question);if(seenStems.has(stem)){repeatedStems++;console.log('AYNI SORU KÖKÜ:',seenStems.get(stem),id,item.question)}else seenStems.set(stem,id);answers.add(norm(item.answer));}
 answerGroups+=answers.size;
}));
const bmi=bmiExercises(books[3].units[4]);const bmiStems=new Set(bmi.map(x=>norm(x.question)));if(bmiStems.size!==bmi.length)errors.push('VKİ soru kökleri tekrarlı');for(const q of bmi){if(new Set([q.answer,...q.wrong].map(norm)).size!==4)errors.push(`VKİ tekrarlı seçenek: ${q.question}`)}
console.log(`${count} kavram/senaryo sorusu, ${bmi.length} sayısal alıştırma; ${repeatedStems} birebir eşleşen soru kökü; ünite başına normalize doğru yanıta göre ${answerGroups} grup.`);
// --- Kaynak temellendirme (konu anlatımı + kitap pasajı) raporu ---
const gi=groundingIndex as Record<string,number>;
const giVals=Object.values(gi);
const lowGrounding=giVals.filter(v=>Number(v)<0.55).length;
console.log(`Kaynak temellendirme: ${giVals.length} soru dizinlendi, ${lowGrounding} tanesi konu anlatım özeti + kitap pasajı dışında (eşik %55).`);
if(lowGrounding>0){
 const lowStems=Object.entries(gi).filter(([,v])=>Number(v)<0.55).slice(0,10);
 for(const [stem,v] of lowStems)console.log(`   · ${v} :: ${stem.slice(0,90)}`);
}
console.log('UYARI: Aynı cevap her zaman aynı kavram değildir; farklı cevap da kavramsal benzersizliği garanti etmez. Anlamsal ve bilimsel uzman incelemesi gereklidir.');
if(errors.length){console.error(errors.join('\n'));process.exitCode=1}
