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
writeFileSync('server/question-bank.json',JSON.stringify(questions,null,2));
