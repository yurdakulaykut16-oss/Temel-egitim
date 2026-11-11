import unittest
from train_lora import adapter_options, validate_trainable
from budget import SUPPORTED_BASES, base_headroom

class AdapterConfigTest(unittest.TestCase):
    def test_compact(self):
        cfg = adapter_options('compact')
        self.assertEqual(cfg['r'], 1)
        self.assertEqual(cfg['target_modules'], ['q_proj'])
        self.assertEqual(len(cfg['layers_to_transform']), 24)
        validate_trainable(98304, 'compact')
        with self.assertRaises(ValueError):
            validate_trainable(150000, 'compact')

    def test_standard(self):
        self.assertEqual(adapter_options('standard')['r'], 8)
        validate_trainable(1000000, 'standard')
        with self.assertRaises(ValueError):
            validate_trainable(0, 'standard')

    def test_pro_and_dora(self):
        pro = adapter_options('pro')
        self.assertEqual(pro['r'], 16)
        self.assertTrue(pro['use_rslora'])
        self.assertIn('gate_proj', pro['target_modules'])
        dora = adapter_options('dora')
        self.assertTrue(dora['use_dora'])
        self.assertIn('Qwen/Qwen3-8B', SUPPORTED_BASES)
        self.assertIn('Qwen/Qwen2.5-7B-Instruct', SUPPORTED_BASES)
        self.assertIn('Qwen/Qwen2.5-Coder-14B-Instruct', SUPPORTED_BASES)
        self.assertIn('Qwen/Qwen2.5-Coder-32B-Instruct', SUPPORTED_BASES)
        self.assertIn('Qwen/Qwen3-Coder-30B-A3B-Instruct', SUPPORTED_BASES)
        self.assertEqual(adapter_options('ultra')['r'], 32)
        mega = adapter_options('mega')
        self.assertEqual(mega['r'], 64)
        self.assertTrue(mega['use_dora'])
        omega = adapter_options('omega')
        self.assertEqual(omega['r'], 128)
        self.assertEqual(omega['lora_alpha'], 256)
        self.assertTrue(omega['use_dora'])
        self.assertTrue(omega['use_rslora'])
        singularity = adapter_options('singularity')
        self.assertEqual(singularity['r'], 256)
        self.assertEqual(singularity['lora_alpha'], 512)
        self.assertTrue(singularity['use_dora'])
        self.assertTrue(singularity['use_rslora'])
        for coder_base in [
            'Qwen/Qwen2.5-Coder-1.5B-Instruct',
            'Qwen/Qwen2.5-Coder-3B-Instruct',
            'Qwen/Qwen3-Coder-7B-Instruct',
            'Qwen/Qwen3-Coder-14B-Instruct',
            'Qwen/QwQ-32B',
            'deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct',
            'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
            'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B',
            'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
            'microsoft/phi-4',
            'bigcode/starcoder2-7b',
            'bigcode/starcoder2-15b',
            'mistralai/Devstral-Small-2505',
            'ibm-granite/granite-8b-code-instruct',
            'ibm-granite/granite-20b-code-instruct',
            '01-ai/Yi-Coder-9B-Chat',
            'google/codegemma-7b-it',
            'infly/OpenCoder-8B-Instruct',
            'open-r1/OlympicCoder-7B',
            'open-r1/OlympicCoder-32B',
            'CohereForAI/aya-expanse-8b',
        ]:
            self.assertIn(coder_base, SUPPORTED_BASES)
        self.assertGreater(base_headroom('Qwen/Qwen3-8B')['train'], base_headroom('Qwen/Qwen2.5-3B-Instruct')['train'])

if __name__ == '__main__':
    unittest.main()
