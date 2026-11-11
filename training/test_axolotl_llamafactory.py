import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import axolotl_llamafactory as axlf
import orchestrate_agents


class AxolotlLlamaFactoryTests(unittest.TestCase):
    def test_generates_valid_configs_and_dpo_pairs(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td)
            questions = [
                {
                    'unitId': '0-0',
                    'unit': 'Antrenman İlkeleri',
                    'question': 'VO2max neyi ölçer?',
                    'options': ['Maksimal oksijen tüketimi', 'Laktat eşiği', 'Nabız rezervi', 'Yağ oranı'],
                    'answer': 'Maksimal oksijen tüketimi',
                    'explanation': 'Maksimal aerobik güç göstergesidir.',
                    'status': 'approved',
                    'difficulty': 'kolay',
                },
                {
                    'unitId': '0-0',
                    'unit': 'Antrenman İlkeleri',
                    'question': 'Hangisi doğrudur?',
                    'options': ['Hepsi', 'Hiçbiri', 'A', 'B'],
                    'answer': 'Hepsi',
                    'status': 'rejected',
                },
            ]
            passages = [{'book': 'Hareket', 'unit': 'Antrenman İlkeleri', 'heading': 'VO2max', 'pages': [12], 'text': 'VO2max aerobik kapasite ölçütüdür.'}]
            res = axlf.export_datasets_and_configs(questions_list=questions, passages_list=passages, out_dir=out)
            self.assertTrue(res['ok'])
            self.assertGreaterEqual(res['sftCount'], 2)
            self.assertGreaterEqual(res['dpoPairCount'], 12)
            self.assertIn('adapter: qlora', Path(res['files']['axolotlSftConfig']).read_text(encoding='utf-8'))
            self.assertIn('rl: dpo', Path(res['files']['axolotlDpoConfig']).read_text(encoding='utf-8'))
            self.assertIn('stage: sft', Path(res['files']['llamafactorySftConfig']).read_text(encoding='utf-8'))
            self.assertIn('stage: dpo', Path(res['files']['llamafactoryDpoConfig']).read_text(encoding='utf-8'))
            info = json.loads(Path(res['files']['llamafactoryDatasetInfo']).read_text(encoding='utf-8'))
            self.assertTrue(info['temel_egitim_dpo']['ranking'])

    def test_orchestrate_agents_bridge(self):
        res = orchestrate_agents.run_bridge('fusion', 'VO2max testi', ['Kaynak pasaj 1'])
        self.assertTrue(res['ok'])
        self.assertEqual(len(res['nodes']), 6)


if __name__ == '__main__':
    unittest.main()
