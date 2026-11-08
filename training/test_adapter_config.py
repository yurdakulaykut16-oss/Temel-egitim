import unittest
from train_lora import adapter_options,validate_trainable
class AdapterConfigTest(unittest.TestCase):
 def test_compact(self):
  cfg=adapter_options('compact')
  self.assertEqual(cfg['r'],1);self.assertEqual(cfg['target_modules'],['q_proj']);self.assertEqual(len(cfg['layers_to_transform']),24)
  validate_trainable(98304,'compact')
  with self.assertRaises(ValueError):validate_trainable(150000,'compact')
 def test_standard(self):
  self.assertEqual(adapter_options('standard')['r'],8)
  validate_trainable(1000000,'standard')
  with self.assertRaises(ValueError):validate_trainable(0,'standard')
if __name__=='__main__':unittest.main()
