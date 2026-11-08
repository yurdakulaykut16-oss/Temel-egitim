#!/usr/bin/env python3
"""Export manually reviewed local questions as grouped, provenance-preserving SFT data."""
import argparse, hashlib, json, random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SYSTEM = 'Sen Türkçe antrenörlük temel eğitim soru yazarısın. Yalnızca verilen anlatımda öğretilen bilgileri kullan. Tek doğru cevabı olan, dört seçenekli, gerekçeli bir soru oluştur. JSON döndür.'

def normalize(text):
    return ' '.join(text.casefold().split())

def build(rows, contexts, reviewer, seed=42):
    if not reviewer.strip():
        raise ValueError('İnsan gözden geçirenin adı veya kodu gerekli.')
    by_id = {x['id']: x for x in contexts}
    records, seen, rejected = [], set(), 0
    for q in rows:
        if q.get('status') != 'approved':
            continue
        ctx = by_id.get(q.get('unitId'))
        question, answer = q.get('question'), q.get('answer')
        options, evidence, explanation, topic = q.get('options'), q.get('evidence'), q.get('explanation'), q.get('topic')
        if (not ctx or not all(isinstance(x, str) and x.strip() for x in (question, answer, evidence, explanation, topic))
            or not isinstance(options, list) or len(options) != 4 or any(not isinstance(x,str) or not x.strip() for x in options)
            or answer not in options or len({normalize(x) for x in options}) != 4
            or len(normalize(evidence)) < 15 or normalize(evidence) not in normalize(ctx['text'])
            or normalize(question) in seen):
            rejected += 1
            continue
        seen.add(normalize(question))
        output = {'question':question, 'options':options, 'answer':answer, 'explanation':explanation, 'evidence':evidence, 'topic':topic}
        prompt = f"Kitap: {ctx['book']}\nÜnite: {ctx['unit']}\nKONU ANLATIMI:\n{ctx['text']}"
        records.append({'unit_id':ctx['id'], 'question_id':q.get('id'), 'reviewer':reviewer.strip(),
                        'source':'Kullanıcı onaylı Ollama sorusu; bağımsız uzman onayı doğrulanmadı',
                        'context_sha256':hashlib.sha256(ctx['text'].encode('utf-8')).hexdigest(),
                        'messages':[{'role':'system','content':SYSTEM},{'role':'user','content':prompt},
                                    {'role':'assistant','content':json.dumps(output,ensure_ascii=False)}]})
    # Aynı ünitenin soruları iki kümeye dağılmasın; rastgele soru bölme ciddi sızıntıya neden olur.
    units = sorted({r['unit_id'] for r in records})
    if len(records) < 50 or len(units) < 5:
        raise ValueError(f'Eğitim için en az 50 geçerli, insan onaylı soru ve 5 farklı ünite gerekir. Mevcut: {len(records)} soru, {len(units)} ünite.')
    random.Random(seed).shuffle(units)
    n_eval = max(1, len(units)//5)
    eval_units=set(units[:n_eval])
    train=[r for r in records if r['unit_id'] not in eval_units]
    val=[r for r in records if r['unit_id'] in eval_units]
    return train,val,rejected

def main():
    ap=argparse.ArgumentParser(description='Onaylı soruları eğitim ve ünite bazlı doğrulama verisine ayırır.')
    ap.add_argument('--input',default=str(ROOT/'.tempo-data/questions.json'))
    ap.add_argument('--contexts',default=str(ROOT/'server/contexts.json'))
    ap.add_argument('--output',default=str(ROOT/'.tempo-data/training'))
    ap.add_argument('--reviewer',required=True,help='Gerçek insan inceleyicinin adı veya kodu; uzmanlık otomatik doğrulanmaz.')
    ap.add_argument('--seed',type=int,default=42)
    args=ap.parse_args()
    try:
        rows=json.loads(Path(args.input).read_text(encoding='utf-8'))
        contexts=json.loads(Path(args.contexts).read_text(encoding='utf-8'))
        train,val,rejected=build(rows,contexts,args.reviewer,args.seed)
    except (OSError,ValueError,TypeError,KeyError) as e:
        ap.error(str(e))
    out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    for name,items in [('train',train),('eval',val)]:
        (out/f'{name}.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in items),encoding='utf-8')
    metadata={'train_count':len(train),'eval_count':len(val),'rejected_count':rejected,
              'train_units':sorted({r['unit_id'] for r in train}), 'eval_units':sorted({r['unit_id'] for r in val}),
              'seed':args.seed,'reviewer':args.reviewer,'warning':'İnsan onayı uzman doğrulaması anlamına gelmez.'}
    (out/'manifest.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(metadata,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
