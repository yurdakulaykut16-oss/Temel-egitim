import json
import unittest
from evaluate import check_output, one_per_unit

class TestEvaluation(unittest.TestCase):
    def test_format_and_quality_hygiene(self):
        obj = {
            'question': 'Soru nedir?',
            'answer': 'İlk seçenek',
            'options': ['İlk seçenek', 'İkinci seçenek', 'Üçüncü seçenek', 'Dördüncü seçenek'],
            'explanation': 'Gerekçe',
            'evidence': 'Dersin uzun bir kaynak ifadesi',
            'topic': 'Konu'
        }
        r = check_output(json.dumps(obj, ensure_ascii=False), 'Dersin uzun bir kaynak ifadesi anlatılır.', set())
        self.assertTrue(r['format_pass'])
        self.assertTrue(r['quality_pass'])
        self.assertFalse(check_output(json.dumps(obj, ensure_ascii=False), 'Başka konu', set())['format_pass'])
        self.assertFalse(check_output(json.dumps(obj, ensure_ascii=False), 'Dersin uzun bir kaynak ifadesi anlatılır.', {'soru nedir'})['format_pass'])

        # Yasaklı seçenek (hepsi/hiçbiri) formatı geçse bile kalite kapısından kalmalı
        banned = {**obj, 'options': ['İlk seçenek', 'İkinci seçenek', 'Üçüncü seçenek', 'Yukarıdakilerin hepsi']}
        r_banned = check_output(json.dumps(banned, ensure_ascii=False), 'Dersin uzun bir kaynak ifadesi anlatılır.', set())
        self.assertTrue(r_banned['format_pass'])
        self.assertFalse(r_banned['option_hygiene'])
        self.assertFalse(r_banned['quality_pass'])

        # Aşırı uzun doğru şık ipucu sızıntısı
        long_ans = 'Bu çok ama çok uzun ve her detayı açıkça anlatan doğru seçenek metnidir'
        biased = {**obj, 'answer': long_ans, 'options': [long_ans, 'Kısa A', 'Kısa B', 'Kısa C']}
        r_biased = check_output(json.dumps(biased, ensure_ascii=False), 'Dersin uzun bir kaynak ifadesi anlatılır.', set())
        self.assertFalse(r_biased['length_balance'])
        self.assertFalse(r_biased['quality_pass'])

        obj['options'] = ['x', 'x', 'y', 'z']
        self.assertFalse(check_output(json.dumps(obj, ensure_ascii=False), 'Dersin uzun bir kaynak ifadesi anlatılır.', set())['format_pass'])

        # 96-Tuzak placeholder ve enjeksiyon koruması
        ph = {**obj, 'options': ['İlk seçenek', 'İkinci seçenek', 'Seçenek C buraya', 'Dördüncü seçenek']}
        r_ph = check_output(json.dumps(ph, ensure_ascii=False), 'Dersin uzun bir kaynak ifadesi anlatılır.', set())
        self.assertFalse(r_ph['trap_shield'])
        self.assertFalse(r_ph['quality_pass'])

    def test_one_per_unit(self):
        self.assertEqual(len(one_per_unit([{'unit_id': 'a'}, {'unit_id': 'a'}, {'unit_id': 'b'}])), 2)

if __name__ == '__main__':
    unittest.main()
