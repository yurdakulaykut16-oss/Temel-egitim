import json
import tempfile
import unittest
from pathlib import Path
from prepare import build, build_multitask_extras, collect_verified_100_rows

class PreparationTest(unittest.TestCase):
    def test_split_units_no_leak_and_deduplicate(self):
        contexts = [{'id': f'{i}-0', 'book': f'Kitap {i}', 'unit': f'Ünite {i}', 'text': 'Bu metin yeterince uzun bir kaynak cümlesidir.'} for i in range(5)]
        def row(i, unit):
            return {
                'id': str(i), 'status': 'approved', 'unitId': unit,
                'question': f'Soru {i}?', 'answer': 'A', 'options': ['A', 'B', 'C', 'D'],
                'evidence': 'Bu metin yeterince uzun bir kaynak cümlesidir.', 'explanation': 'Açıklama', 'topic': 'Konu',
                'verification': {'judges': [{'model': 'm1', 'answer': 'A', 'difficulty': 'kolay', 'qualityScore': 5, 'reason': 'Doğru'}]}
            }
        rows = [row(i, f'{i%5}-0') for i in range(60)]
        rows += [row(0, '0-0'), {**row(61, '0-0'), 'status': 'pending'}, {**row(62, '0-0'), 'evidence': 'kaynakta yer almayan cümle'}]
        train, valid, rejected = build(rows, contexts, 'inceleyici')
        self.assertEqual(len(train)+len(valid), 60)
        self.assertEqual(rejected, 2)
        self.assertFalse({r['unit_id'] for r in train} & {r['unit_id'] for r in valid})

        eval_units = {r['unit_id'] for r in valid}
        passages = {'0-0#01': {'id': '0-0#01', 'heading': 'Başlık', 'keywords': ['K1'], 'sourceType': 'book', 'text': 'Kitaptan uzun bir pasaj metni.'}}
        traces = [{'unitId': '0-0', 'draft': {**row(99, '0-0'), 'question': 'Kötü soru?'}}]
        study_data = {
            'flashcards': [{'id': 'fc1', 'unitId': '0-0', 'front': 'Kart ön', 'back': 'Kart arka', 'evidence': 'Bu metin', 'difficulty': 'kolay', 'status': 'approved'}],
            'matchings': [{'id': 'm1', 'unitId': '0-0', 'title': 'Eşleşme', 'pairs': [{'left': 'A', 'right': '1'}], 'evidence': 'Bu metin', 'difficulty': 'orta', 'status': 'approved'}]
        }
        ex_tr, ex_val, dpo_tr, dpo_val = build_multitask_extras(rows, contexts, passages, eval_units, traces, study_data=study_data)
        self.assertTrue(any(r['task'] == 'judge' for r in ex_tr))
        self.assertTrue(any(r['task'] == 'socratic_reasoning' for r in ex_tr))
        self.assertTrue(any(r['task'] == 'trap_shield' for r in ex_tr))
        self.assertTrue(any(r['task'] == 'flashcard' for r in ex_tr + ex_val))
        self.assertTrue(any(r['task'] == 'matching' for r in ex_tr + ex_val))
        self.assertTrue(len(dpo_tr) + len(dpo_val) >= 1)
        # eval ünitelerindeki knowledge kayıtları asla eğitim kümesine sızmamalı
        for r in ex_tr:
            self.assertNotIn(r['unit_id'], eval_units)

    def test_guard(self):
        with self.assertRaises(ValueError):
            build([], [], 'test')
        with self.assertRaises(ValueError):
            build([], [], ' ')

    def test_collect_verified_100_rows_filters_unverified(self):
        with tempfile.TemporaryDirectory() as tmp:
            tdir = Path(tmp)
            gpath = tdir / 'github-oss-knowledge.json'
            vpath = tdir / 'hundred-way-verifier.json'
            gpath.write_text(json.dumps({
                'insightsExtracted': [
                    {'repo': 'ok/repo', 'license': 'MIT', 'targetBot': 'generator', 'actionableRule': 'Her soru kanıt cümlesine birebir dayanmalıdır.', 'verified100': True},
                    {'repo': 'bad/repo', 'license': 'GPL-3.0', 'targetBot': 'generator', 'actionableRule': 'Engelli aday kesinlikle eklenmemeli.', 'verified100': False},
                    {'repo': 'quarantined/repo', 'blocked': True, 'actionableRule': 'Karantinadaki kayıt eğitim verisine sızmamalı.'},
                ]
            }, ensure_ascii=False), encoding='utf-8')
            vpath.write_text(json.dumps({
                'recentRuns': [{'title': '100x Onaylı BM25 İndeksleyici', 'approvedForProject': True, 'passedCount': 100}],
                'rejectedQuarantine': [{'title': 'Bozuk Yama', 'passedCount': 94, 'failedPaths': ['AST dengesi']}]
            }, ensure_ascii=False), encoding='utf-8')

            sft, dpo = collect_verified_100_rows(gpath, vpath, eval_units={'0-0'}, reviewer='test-rev')
            self.assertEqual(len(sft), 1)
            self.assertEqual(sft[0]['task'], 'verified_100_oss_insight')
            self.assertIn('ok/repo', sft[0]['messages'][1]['content'])
            self.assertEqual(len(dpo), 1)
            self.assertIn('"passedCount": 100', dpo[0]['chosen'])
            self.assertIn('"passedCount": 94', dpo[0]['rejected'])

if __name__ == '__main__':
    unittest.main()
