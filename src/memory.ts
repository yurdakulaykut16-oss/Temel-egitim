/** Small, transparent unit-level review schedule; not a claim of permanent mastery. */
export type Review = {stage:number; due:number; reviewed:number};
export type Reviews = Record<string,Review>;
const DAY=86_400_000;
const intervals=[1,3,7,14,30];
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
      return Number.isInteger(v.stage)&&v.stage>=0&&v.stage<=4&&Number.isFinite(v.due)&&Number.isFinite(v.reviewed);
    })) as Reviews;
  } catch {return {};}
}
