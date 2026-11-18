import {writeFileSync,readFileSync} from 'node:fs';
import {authoredBank} from './authored-bank';
import {questionKey} from '../src/quizSelection';
import {createSummaryGrounding} from '../server/summary-grounding.mjs';
import {expanded} from '../src/expanded';
import {books} from '../src/data';
import {deepDive} from '../src/extra';
import {unique} from '../src/unique';
import {advanced} from '../src/advanced';
import {newQuestions} from '../src/newQuestions';
import {bookNotes} from '../src/bookNotes';
import bookSummary from '../src/bookSummary.json';
import bookToc from '../src/bookToc.json';
import webSummary from '../src/webSummary.json';
import {examSamples} from '../src/examSamples';
// Konu özeti = elle yazılmış anlatım + kitaptan seçilmiş cümleler (src/bookSummary.json;
// scripts/build-book-summary.py kitap PDF'lerinden üretir). Soru stüdyosu soruları YALNIZCA bu
// özetten kurar; zorluk ve konu çeşitliliği için özet kitapla büyütülmüştür.
// baseChars: metnin elle yazılmış bölümünün uzunluğu (kısa özet isteyen modüller için).
// pageMarks: [metindeki başlangıç konumu, kitap sayfası] — kitaptan alınan her bölümün hangi sayfadan geldiği.
// chapter / chapterNo / sections: kitabın "İçindekiler" sayfalarından çıkarılan bölüm adı ve konu başlıkları
// (src/bookToc.json); sectionMarks: [metindeki başlangıç konumu, konu sıra no] — cümlenin hangi konu başlığının altında olduğu.
const contexts=books.flatMap((b,bi)=>b.units.map((u,ui)=>{const id=`${bi}-${ui}`;const base=[u.lesson,...expanded[bi][ui],deepDive[bi][ui],unique[id]?.lesson,advanced[id]?.lesson,newQuestions[id]?.lesson,bookNotes[id]?.text].filter(Boolean).join(' ');const groups=((bookSummary as Record<string,{pages:number[];section?:number;sentences:string[]}[]>)[id]||[]).filter(g=>g.sentences.length);
 const toc=(bookToc as Record<string,{no:number;title:string;sections:{title:string;level:number;page:number|null;parent:number|null;toc:boolean}[]}>)[id];
 let text=base;const pageMarks:number[][]=[];const sectionMarks:number[][]=[];
 for(const g of groups){
  const at=text.length+1;
  if(!pageMarks.length||pageMarks[pageMarks.length-1][1]!==g.pages[0])pageMarks.push([at,g.pages[0]]);
  sectionMarks.push([at,Number.isInteger(g.section)?g.section as number:-1]);
  text+=' '+g.sentences.join(' ');
 }
 // İnternetten derlenen ek anlatım (src/webSummary.json): kitap cümlelerinden SONRA gelir ve
 // webStart konumundan başlar; her bölümün kaynağı webSources içinde tutulur.
 const web=((webSummary as Record<string,{topic?:string;source:string;sourceTitle?:string;kind?:string;sentences:string[]}[]>)[id]||[]).filter(g=>g.sentences?.length);
 const webStart=web.length?text.length+1:null;const webMarks:number[][]=[];const webSources:{topic:string;title:string;url:string;kind?:string}[]=[];
 for(const g of web){
  webMarks.push([text.length+1,webSources.length]);
  webSources.push({topic:g.topic||'',title:g.sourceTitle||'',url:g.source||'',...(g.kind?{kind:g.kind}:{})});
  text+=' '+g.sentences.join(' ');
 }
 return {id,book:b.title,unit:u.title,chapterNo:toc?.no??ui+1,chapter:toc?.title||u.title,text,baseChars:base.length,pageMarks,
  sections:(toc?.sections||[]).map(x=>({title:x.title,level:x.level,page:x.page,parent:x.parent,toc:x.toc})),sectionMarks,webStart,webMarks,webSources};}));
writeFileSync('server/contexts.json',JSON.stringify(contexts,null,2));
// Kullanıcının gönderdiği örnek / çıkmış sorular: soru yazan modele "sınav tarzı" örneği olarak verilir.
writeFileSync('server/exam-samples.json',JSON.stringify({samples:examSamples},null,1));

// --- Kaynak temellendirme dizini -------------------------------------------------
// Her sorunun "konu anlatım özeti + kitap pasajı" kapsama puanı, normalleştirilmiş
// soru köküne göre dizinlenir ve istemciye gönderilir. Böylece kullanıcı "özetlerimde
// olmayan hiçbir şey soru olarak çıkmasın" dediğinde test havuzu tek anahtarla
// kaynak dışı sorulardan arındırılabilir.
const bookPassages=JSON.parse(readFileSync('server/book-passages.json','utf8'));
const passagesByUnit=new Map<string,{text:string}[]>(bookPassages.units.map((u:any)=>[u.id as string,(u.passages||[]) as {text:string}[]]));
const grounding=createSummaryGrounding({contexts,passagesByUnit});
const groundingIndex:Record<string,number>={};
const addGrounding=(unitId:string,question:string,answer:string)=>{
 const res=grounding.scoreItem({unitId,question,answer});
 if(!res)return;
 groundingIndex[questionKey(unitId,question)]=Number(res.score.toFixed(3));
};

// Hazır havuz kotasızdır: tekrarları ayıklanmış sabit banka ile kitap ve paralel soruların tamamı dizinlenir.
const readBookPool=(file:string)=>{
 try{return JSON.parse(readFileSync(file,'utf8')).questions||[];}
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
};
const bookPool=readBookPool('server/book-style-questions.json');
const parallelPool=readBookPool('server/book-parallel-questions.json');
for(const q of authoredBank) addGrounding(q.unitId,q.question,q.answer);
for(const q of [...bookPool,...parallelPool]){
 const score=Number(q.grounding?.score);
 if(Number.isFinite(score)) groundingIndex[questionKey(q.unitId,q.question)]=score;
 else addGrounding(q.unitId,q.question,q.answer);
}
console.log(`Hazır havuz: ${authoredBank.length+bookPool.length+parallelPool.length} soru (${authoredBank.length} sabit, ${bookPool.length} kitap, ${parallelPool.length} paralel).`);
writeFileSync('server/question-bank.json',JSON.stringify(authoredBank,null,2));
writeFileSync('src/groundingIndex.json',JSON.stringify(groundingIndex,null,0));
const lowGrounding=Object.values(groundingIndex).filter(v=>v<0.55).length;
console.log(`Kaynak temellendirme dizini: ${Object.keys(groundingIndex).length} soru, ${lowGrounding} tanesi kaynak dışı (eşik %55) -> src/groundingIndex.json`);
