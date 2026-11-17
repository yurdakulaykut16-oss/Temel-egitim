// EZBER ÖZETİ: kitaptaki her başlık için kısa, ezberlenebilir özet (scripts/build-unit-briefs.py üretir).
// Ders sayfası ve Tekrar yolu kartları bu veriyi kullanır.
import raw from './unitBriefs.json';

export type BriefSection={i:number;title:string;level:number;page:number|null;points:string[];list?:string[];listMore?:number;listIntro?:string;terms?:string[];notes?:string[];next?:string};
/** Liste, arayüzde ilk bu kadar maddesiyle açık gösterilir; kalanı "tümünü göster" ile açılır. */
export const LIST_PREVIEW=8;
export type UnitBriefData={title:string;firstPage:number;sections:BriefSection[]};
/** Bir ana konu (kitaptaki 2. düzey başlık) ve altındaki bütün alt başlıklar: tek bir ezber kartı. */
export type BriefGroup={id:string;unitId:string;head:BriefSection;children:BriefSection[]};

export const unitBriefs=raw as unknown as Record<string,UnitBriefData>;

export const cardId=(unitId:string,sectionIndex:number)=>`${unitId}#${sectionIndex}`;
export const unitOfCard=(id:string)=>id.split('#')[0];

const groupCache=new Map<string,BriefGroup[]>();
export function briefGroups(unitId:string):BriefGroup[]{
 const cached=groupCache.get(unitId);
 if(cached)return cached;
 const groups:BriefGroup[]=[];
 for(const section of unitBriefs[unitId]?.sections||[]){
  if(section.level===2||!groups.length)groups.push({id:cardId(unitId,section.i),unitId,head:section,children:[]});
  else groups[groups.length-1].children.push(section);
 }
 groupCache.set(unitId,groups);
 return groups;
}

/** Ezber kartı olan konular: alt başlığı olmayan "Giriş" derste gösterilir ama tekrar kartı yapılmaz (ezberlenecek bilgi taşımaz). */
const isIntroOnly=(g:BriefGroup)=>g.children.length===0&&/^giriş$/i.test(g.head.title.trim());
export const memoryGroups=(unitId:string):BriefGroup[]=>briefGroups(unitId).filter(g=>!isIntroOnly(g));
export const isMemoryCard=(id:string)=>memoryGroups(unitOfCard(id)).some(g=>g.id===id);

export const sectionHasContent=(s:BriefSection)=>s.points.length>0||Boolean(s.list?.length)||Boolean(s.notes?.length);

/** Sesli okuma ve arama için düz metin. */
export function sectionText(s:BriefSection):string{
 return [s.title+'.',...s.points,s.listIntro||'',...(s.list||[]).map(x=>x+'.'),s.terms?.length?`Kavramlar: ${s.terms.join(', ')}.`:'',...(s.notes||[])].filter(Boolean).join(' ');
}
export const groupText=(g:BriefGroup)=>[g.head,...g.children].map(sectionText).join(' ');

export function briefStats(unitId:string){
 const sections=unitBriefs[unitId]?.sections||[];
 // Okuma süresi açık görünen metne göredir (uzun listelerin katlanmış kısmı sayılmaz).
 const words=sections.reduce((n,s)=>n+sectionText({...s,list:s.list?.slice(0,LIST_PREVIEW)}).split(/\s+/).length,0);
 return {headings:sections.length,groups:briefGroups(unitId).length,minutes:Math.max(1,Math.round(words/180))};
}
