import unittest
from evaluate import check_output,one_per_unit
class TestEvaluation(unittest.TestCase):
 def test_format(self):
  import json
  obj={'question':'Soru nedir?','answer':'İlk seçenek','options':['İlk seçenek','İkinci','Üçüncü','Dördüncü'],'explanation':'Gerekçe','evidence':'Dersin uzun bir kaynak ifadesi','topic':'Konu'}
  r=check_output(json.dumps(obj,ensure_ascii=False),'Dersin uzun bir kaynak ifadesi anlatılır.',set());self.assertTrue(r['format_pass'])
  self.assertFalse(check_output(json.dumps(obj,ensure_ascii=False),'Başka konu',set())['format_pass'])
  self.assertFalse(check_output(json.dumps(obj,ensure_ascii=False),'Dersin uzun bir kaynak ifadesi anlatılır.',{'soru nedir'})['format_pass'])
  obj['options']=['x','x','y','z'];self.assertFalse(check_output(json.dumps(obj,ensure_ascii=False),'Dersin uzun bir kaynak ifadesi anlatılır.',set())['format_pass'])
 def test_one_per_unit(self):self.assertEqual(len(one_per_unit([{'unit_id':'a'},{'unit_id':'a'},{'unit_id':'b'}])),2)
if __name__=='__main__':unittest.main()
