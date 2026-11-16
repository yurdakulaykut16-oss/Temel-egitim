// Kullanıcının gönderdiği örnek / çıkmış sorular (src/examSamples.json) -> uygulamanın
// sabit soru satırı biçimi: "soru|doğru|yanlış|yanlış|yanlış|açıklama".
import data from './examSamples.json';

export type ExamSample={id:string;unitId:string;origin:string;style?:string;question:string;options5:string[];options:string[];answer:string;explanation:string;note?:string;reconstructed?:boolean;answerVerified?:boolean};
export const examSamples=(data as {samples:ExamSample[]}).samples;
export const examSampleLines:Record<string,string[]>={};
for(const s of examSamples){
 const wrong=s.options.filter(o=>o!==s.answer).slice(0,3);
 (examSampleLines[s.unitId]||=[]).push([s.question,s.answer,...wrong,s.explanation].join('|'));
}
