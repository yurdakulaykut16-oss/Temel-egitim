import unittest
from prepare import build
class PreparationTest(unittest.TestCase):
    def test_split_units_no_leak_and_deduplicate(self):
        contexts=[{'id':f'{i}-0','book':f'Kitap {i}','unit':f'Ünite {i}','text':'Bu metin yeterince uzun bir kaynak cümlesidir.'} for i in range(5)]
        def row(i,unit): return {'id':str(i),'status':'approved','unitId':unit,'question':f'Soru {i}?','answer':'A','options':['A','B','C','D'],'evidence':'Bu metin yeterince uzun bir kaynak cümlesidir.','explanation':'Açıklama','topic':'Konu'}
        rows=[row(i,f'{i%5}-0') for i in range(60)]
        rows += [row(0,'0-0'),{**row(61,'0-0'),'status':'pending'}, {**row(62,'0-0'),'evidence':'kaynakta yer almayan cümle'}]
        train,valid,rejected=build(rows,contexts,'inceleyici')
        self.assertEqual(len(train)+len(valid),60)
        self.assertEqual(rejected,2)
        self.assertFalse({r['unit_id'] for r in train}&{r['unit_id'] for r in valid})
    def test_guard(self):
        with self.assertRaises(ValueError):build([],[],'test')
        with self.assertRaises(ValueError):build([],[],' ')
if __name__=='__main__': unittest.main()
