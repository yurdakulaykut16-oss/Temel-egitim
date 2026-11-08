/** Kalıcı ezber hedefli, aşamalı tekrar takvimi; şeffaf bir önerilerdir, kesin kalıcılık garantisi değildir.
 * Bir konu "Hatırladım" olarak işaretlendikçe aralar büyür (1, 3, 7, 14, 30, 60, 120, 240, 365 gün);
 * son aşamaya ulaşıldıktan sonra da yaklaşık yılda bir tekrarla konu gündemde tutulur. Herhangi bir
 * anda "Tekrar etmeliyim" denirse veya testte yanlış yapılırsa aşama sıfırlanır ve 10 dakika sonraya
 * alınır; böylece bir kez öğrenilen bir şey sessizce unutulmaz, düzenli aralıklarla yeniden sınanır. */
export type Review = {stage:number; due:number; reviewed:number};
export type Reviews = Record<string,Review>;
const DAY=86_400_000;
export const intervals=[1,3,7,14,30,60,120,240,365];
export function schedule(previous:Review|undefined, remembered:boolean, now:number):Review {
  if (!remembered) return {stage:0,due:now+10*60_000,reviewed:now};
  const stage=Math.max(0,Math.min(intervals.length-1,previous?.stage||0));
  return {stage:Math.min(stage+1,intervals.length-1),due:now+intervals[stage]*DAY,reviewed:now};
}
export function prioritize(now:number):Review { return {stage:0,due:now,reviewed:now}; }
export function loadReviews(raw:string|null):Reviews {
  try {
    const parsed=JSON.parse(raw||'{}');
    if (!parsed || typeof parsed!=='object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([,value])=> {
      if (!value || typeof value!=='object') return false;
      const v=value as Review;
      return Number.isInteger(v.stage)&&v.stage>=0&&v.stage<=intervals.length-1&&Number.isFinite(v.due)&&Number.isFinite(v.reviewed);
    })) as Reviews;
  } catch {return {};}
}
