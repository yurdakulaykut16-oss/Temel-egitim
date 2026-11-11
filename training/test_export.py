import json, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import ollama_export as exp

class ExportTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(); self.root=Path(self.temp.name); self.repo=self.root/'llama cpp'; (self.repo/'build/bin').mkdir(parents=True); (self.repo/'convert_hf_to_gguf.py').write_text(''); (self.repo/'build/bin/llama-quantize').write_text(''); self.adapter=self.root/'adapter';self.adapter.mkdir()
  (self.adapter/'adapter_config.json').write_text(json.dumps({'base_model_name_or_path':'Qwen/Qwen2.5-3B-Instruct'}));(self.adapter/'adapter_model.safetensors').write_text('weights');(self.adapter/'training-metadata.json').write_text(json.dumps({'base':'Qwen/Qwen2.5-3B-Instruct'}))
  self.calls=[];self.registered=[];self.fail_quantize=False
 def tearDown(self): self.temp.cleanup()
 def run_fake(self,args,*,cwd=None,capture=False):
  a=[str(x) for x in args];self.calls.append(a)
  if a[0]=='ollama' and a[1]=='list':return SimpleNamespace(stdout='NAME ID SIZE\n'+''.join(n+' id 1G\n' for n in self.registered))
  if 'merge_adapter.py' in a[1]:Path(a[a.index('--output')+1]).mkdir()
  elif 'convert_hf_to_gguf.py' in a[1]:Path(a[a.index('--outfile')+1]).write_text('GGUF')
  elif a[0].endswith('llama-quantize'):
   if self.fail_quantize: raise RuntimeError('nicemleme hatası')
   Path(a[2]).write_text('GGUF')
  elif a[0]=='ollama' and a[1]=='create':self.registered.append(a[2])
  return SimpleNamespace(stdout='')
 def test_complete_and_no_overwrite(self):
  with patch.object(exp.shutil,'which',return_value='ollama'),patch.object(exp,'run',side_effect=self.run_fake),patch.object(exp,'DATA',self.root),patch.object(exp,'require_headroom'),patch.object(exp,'register_model'):
   tools=exp.preflight(self.repo,'tempo-test:one'); report=exp.export(self.adapter,tools,'tempo-test:one',self.root/'export')
   self.assertEqual(report['model'],'tempo-test:one');self.assertEqual(self.registered,['tempo-test:one'])
   self.assertTrue((self.root/'export/export-report.json').exists()); self.assertFalse((self.root/'export/merged').exists());self.assertFalse((self.root/'export/model-f16.gguf').exists())
   with self.assertRaises(ValueError):exp.preflight(self.repo,'tempo-test:one')
 def test_rejects_wrong_base_before_any_export(self):
  (self.adapter/'training-metadata.json').write_text(json.dumps({'base':'Qwen/wrong'}))
  with patch.object(exp.shutil,'which',return_value='ollama'),patch.object(exp,'run',side_effect=self.run_fake),patch.object(exp,'DATA',self.root),patch.object(exp,'require_headroom'),patch.object(exp,'register_model'):
   tools=exp.preflight(self.repo,'tempo-test:two')
   with self.assertRaisesRegex(ValueError,'100 GB|eşleşmiyor'):exp.export(self.adapter,tools,'tempo-test:two',self.root/'export')
   self.assertEqual(self.registered,[])
 def test_failure_does_not_create_model(self):
  self.fail_quantize=True
  with patch.object(exp.shutil,'which',return_value='ollama'),patch.object(exp,'run',side_effect=self.run_fake),patch.object(exp,'DATA',self.root),patch.object(exp,'require_headroom'),patch.object(exp,'register_model'):
   tools=exp.preflight(self.repo,'tempo-test:three')
   with self.assertRaisesRegex(RuntimeError,'nicemleme'):exp.export(self.adapter,tools,'tempo-test:three',self.root/'export')
   self.assertEqual(self.registered,[]);self.assertTrue((self.adapter/'adapter_model.safetensors').exists())
 def test_supports_qwen3_8b_export(self):
  (self.adapter/'adapter_config.json').write_text(json.dumps({'base_model_name_or_path':'Qwen/Qwen3-8B'}))
  (self.adapter/'training-metadata.json').write_text(json.dumps({'base':'Qwen/Qwen3-8B'}))
  with patch.object(exp.shutil,'which',return_value='ollama'),patch.object(exp,'run',side_effect=self.run_fake),patch.object(exp,'DATA',self.root),patch.object(exp,'require_headroom'),patch.object(exp,'register_model'):
   tools=exp.preflight(self.repo,'tempo-test:qwen3')
   report=exp.export(self.adapter,tools,'tempo-test:qwen3',self.root/'export-q3')
   self.assertEqual(report['base'],'Qwen/Qwen3-8B')
   self.assertIn('tempo-test:qwen3',self.registered)
 def test_supports_nexus_titan_fusion_profile(self):
  (self.adapter/'adapter_config.json').write_text(json.dumps({'base_model_name_or_path':'Qwen/Qwen3-8B'}))
  (self.adapter/'training-metadata.json').write_text(json.dumps({'base':'Qwen/Qwen3-8B'}))
  with patch.object(exp.shutil,'which',return_value='ollama'),patch.object(exp,'run',side_effect=self.run_fake),patch.object(exp,'DATA',self.root),patch.object(exp,'require_headroom'),patch.object(exp,'register_model'):
   tools=exp.preflight(self.repo,'tempo-nexus-titan:latest')
   report=exp.export(self.adapter,tools,'tempo-nexus-titan:latest',self.root/'export-nexus',fusion_profile='nexus_titan')
   self.assertEqual(report['model'],'tempo-nexus-titan:latest')
   mf=(self.root/'export-nexus/Modelfile').read_text(encoding='utf-8')
   self.assertIn('Tempo-Nexus-Titan-100x',mf)
   self.assertIn('PARAMETER temperature 0.42',mf)
if __name__=='__main__': unittest.main()
