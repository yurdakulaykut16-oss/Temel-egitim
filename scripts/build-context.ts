import {writeFileSync} from 'node:fs';
import {bmiExercises} from '../src/calculations';
import {expanded} from '../src/expanded';
import {books} from '../src/data';
import {extra,deepDive} from '../src/extra';
import {scenarios} from '../src/scenarios';
import {practice} from '../src/practice';
import {reinforcement} from '../src/reinforcement';
import {challenge} from '../src/challenge';
import {unique} from '../src/unique';
import {advanced} from '../src/advanced';
import {newQuestions} from '../src/newQuestions';
import {bookNotes,bookQuestions} from '../src/bookNotes';
const contexts=books.flatMap((b,bi)=>b.units.map((u,ui)=>{const id=`${bi}-${ui}`;return {id,book:b.title,unit:u.title,text:[u.lesson,...expanded[bi][ui],deepDive[bi][ui],unique[id]?.lesson,advanced[id]?.lesson,newQuestions[id]?.lesson,bookNotes[id]?.text].filter(Boolean).join(' ')};}));
writeFileSync('server/contexts.json',JSON.stringify(contexts,null,2));

const questions=books.flatMap((b,bi)=>b.units.flatMap((u,ui)=>{const unitId=`${bi}-${ui}`;const lines=[...extra[bi][ui],...scenarios[bi][ui],...practice[bi][ui],reinforcement[bi][ui],...(unique[unitId]?.questions||[]),...(advanced[unitId]?.questions||[]),...(newQuestions[unitId]?.questions||[]),...(challenge[unitId]||[]),...(bookQuestions[unitId]||[])];return [{unitId,question:u.question,answer:u.answer,options:[u.answer,...u.wrong]},...lines.map(l=>{const [question,answer,...rest]=l.split('|');return {unitId,question,answer,options:[answer,...rest.slice(0,3)]}})];}));
questions.push(...bmiExercises(books[3].units[4]).map(q=>({unitId:'3-4',question:q.question,answer:q.answer,options:[q.answer,...q.wrong]})));

// Birbirinin aynısı / tıpatıp benzeri sorular havuza girmesin:
// 1) sayıları maskelenmiş aynı kalıptan en fazla 2 soru,
// 2) aynı ünitede soru kökü benzerliği %78 ve üzerinde olan tekrar elenir.
const normq=(s:string)=>s.toLocaleLowerCase('tr-TR').replace(/[^a-zçğıöşü0-9]+/g,' ').trim();
const STOP=new Set(['bir','ve','ile','için','gibi','olan','hangisidir','hangisi','nedir','aşağıdakilerden','yukarıdakilerden','göre','daha','olarak','kadar','ancak','fakat','veya','ya','da','de','bu','şu','o','her','tüm','en']);
const stemq=(s:string)=>normq(s).split(' ').filter(w=>w.length>=3&&!STOP.has(w)).map(w=>w.slice(0,6));
const simq=(a:string,b:string)=>{const A=new Set(stemq(a)),B=new Set(stemq(b));if(!A.size||!B.size)return 0;let i=0;for(const w of A)if(B.has(w))i++;return i/Math.max(A.size,B.size)};
const template=(s:string)=>normq(s).replace(/\d+([.,]\d+)?/g,'#');
// Jaccard örtüşmesi (soru kökü + doğru cevap): aynı cevabı paylaşan tekrarları yakalar.
const jacq=(a:string,b:string)=>{const A=new Set(stemq(a)),B=new Set(stemq(b));if(!A.size||!B.size)return 0;let i=0;for(const w of A)if(B.has(w))i++;return i/(A.size+B.size-i)};
const dedupeQuestions=(list:typeof questions)=>{
  const kept:typeof questions=[];const tplCount=new Map<string,number>();
  for(const q of list){
    const tpl=template(q.question);const n=tplCount.get(tpl)||0;
    if(n>=2)continue;
    const clash=kept.some(k=>k.unitId===q.unitId&&(
      simq(k.question,q.question)>=0.78
      ||(normq(k.answer)===normq(q.answer)&&jacq(k.question+' '+k.answer,q.question+' '+q.answer)>=0.45)
    ));
    if(clash)continue;
    tplCount.set(tpl,n+1);kept.push(q);
  }
  return kept;
};
const deduped=dedupeQuestions(questions);
console.log(`Soru bankası: ${questions.length} → ${deduped.length} soru (${questions.length-deduped.length} benzer/tekrar ayıklandı).`);
writeFileSync('server/question-bank.json',JSON.stringify(deduped,null,2));
