import unittest
from pathlib import Path
from auto_train_cycle import should_promote_model, build_plan


class AutoTrainCycleTests(unittest.TestCase):
    def test_gate_promotes_improved_model(self):
        report = {
            'counts': {
                'base': {'total': 10, 'format_pass': 7, 'quality_pass': 6},
                'adapter': {'total': 10, 'format_pass': 9, 'quality_pass': 8},
            },
            'solver_accuracy': {
                'base': {'total': 10, 'correct': 7, 'accuracy_pct': 70.0},
                'adapter': {'total': 10, 'correct': 8, 'accuracy_pct': 80.0},
            },
        }
        ok, info = should_promote_model(report)
        self.assertTrue(ok)
        self.assertEqual(info['adapter_quality_pct'], 80.0)

    def test_gate_blocks_regressed_model(self):
        bad_report = {
            'counts': {
                'base': {'total': 10, 'format_pass': 9, 'quality_pass': 8},
                'adapter': {'total': 10, 'format_pass': 8, 'quality_pass': 5},
            }
        }
        ok, reason = should_promote_model(bad_report)
        self.assertFalse(ok)
        self.assertIn('gerisinde', reason)

        bad_solver = {
            'counts': {
                'base': {'total': 10, 'format_pass': 9, 'quality_pass': 8},
                'adapter': {'total': 10, 'format_pass': 9, 'quality_pass': 8},
            },
            'solver_accuracy': {
                'base': {'total': 10, 'correct': 8, 'accuracy_pct': 80.0},
                'adapter': {'total': 10, 'correct': 5, 'accuracy_pct': 50.0},
            },
        }
        ok2, reason2 = should_promote_model(bad_solver)
        self.assertFalse(ok2)
        self.assertIn('Çözücü doğruluğu', reason2)

    def test_build_plan_paths(self):
        plan = build_plan('/tmp/d', 'Qwen/Qwen3-8B', 'singularity', 'tempo-jarvis:v1', '/tmp/d/jarvis-runs/r1')
        self.assertEqual(plan['ollama_name'], 'tempo-jarvis:v1')
        self.assertEqual(plan['upgrade_tier'], 'Ultra-Singularity-100x')
        self.assertEqual(plan['cumulative_scale_factor'], 150000)
        self.assertTrue(Path(plan['sft_adapter']).name == 'adapter-sft')


if __name__ == '__main__':
    unittest.main()
