#!/usr/bin/env python3
"""JARVIS Otonom Eğitim Döngüsü: prepare -> QLoRA SFT -> DPO -> Held-out Evaluation Gate -> Ollama Export."""
import argparse
import datetime
import json
import os
import subprocess
import sys
from pathlib import Path
from budget import DATA


def emit(stage, **extra):
    print(json.dumps({'stage': stage, **extra}, ensure_ascii=False), flush=True)


def should_promote_model(report):
    """Yeni eğitilen adaptörün held-out ünitelerde gerilemediğini ve minimum kaliteyi geçtiğini doğrular."""
    counts = report.get('counts') or {}
    base_c = counts.get('base') or {}
    adap_c = counts.get('adapter') or {}

    base_total = max(1, int(base_c.get('total') or 0))
    adap_total = int(adap_c.get('total') or 0)
    if adap_total == 0:
        return False, 'Değerlendirme örneği boş; model terfi ettirilmedi.'

    base_qual_rate = (base_c.get('quality_pass') or 0) / base_total
    adap_qual_rate = (adap_c.get('quality_pass') or 0) / adap_total
    adap_fmt_rate = (adap_c.get('format_pass') or 0) / adap_total

    if adap_fmt_rate < 0.70:
        return False, f'Yeni model held-out biçim geçme oranı yetersiz (%{round(adap_fmt_rate*100, 1)} < %70).'
    if adap_qual_rate < max(0.55, base_qual_rate - 0.02):
        return False, (
            f'Yeni model kalite oranı tabanın gerisinde kaldı '
            f'(yeni: %{round(adap_qual_rate*100, 1)} vs taban: %{round(base_qual_rate*100, 1)}).'
        )

    solver = report.get('solver_accuracy') or {}
    if 'base' in solver and 'adapter' in solver:
        base_acc = float(solver['base'].get('accuracy_pct') or 0)
        adap_acc = float(solver['adapter'].get('accuracy_pct') or 0)
        if adap_acc < base_acc - 5.0:
            return False, f'Çözücü doğruluğu düştü (yeni: %{adap_acc} vs taban: %{base_acc}).'

    return True, {
        'base_quality_pct': round(base_qual_rate * 100, 1),
        'adapter_quality_pct': round(adap_qual_rate * 100, 1),
        'adapter_format_pct': round(adap_fmt_rate * 100, 1),
        'solver_accuracy': solver,
    }


def run_step(cmd, cwd):
    proc = subprocess.run([str(x) for x in cmd], cwd=cwd, text=True, capture_output=True)
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or '').strip()[-600:]
        raise RuntimeError(f'Adım başarısız ({" ".join(str(x) for x in cmd[:2])}): {err}')
    return proc.stdout


def build_plan(data_dir, base_model, adapter_size, target_name, run_dir):
    t_dir = Path(data_dir) / 'training'
    sft_dir = Path(run_dir) / 'adapter-sft'
    dpo_dir = Path(run_dir) / 'adapter-dpo'
    return {
        'training_data': str(t_dir),
        'sft_adapter': str(sft_dir),
        'dpo_adapter': str(dpo_dir),
        'base': base_model,
        'adapter_size': adapter_size,
        'ollama_name': target_name,
        'upgrade_tier': 'Ultra-Singularity-100x',
        'cumulative_scale_factor': 150000,
    }


def main():
    ap = argparse.ArgumentParser(description='JARVIS otonom sürekli öz-eğitim ve terfi döngüsü')
    ap.add_argument('--data-dir', default=str(DATA))
    ap.add_argument('--base', default='Qwen/Qwen3-8B')
    ap.add_argument('--adapter-size', default='pro', choices=['compact', 'standard', 'pro', 'dora', 'ultra', 'mega', 'omega', 'singularity'])
    ap.add_argument('--name', required=True, help='Terfi halinde oluşturulacak yeni Ollama model adı')
    ap.add_argument('--epochs', type=float, default=2.0)
    ap.add_argument('--llama-dir', default=os.environ.get('LLAMA_CPP_DIR'))
    ap.add_argument('--plan-only', action='store_true')
    args = ap.parse_args()

    data_root = Path(args.data_dir).expanduser().resolve()
    run_id = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')
    run_dir = data_root / 'jarvis-runs' / run_id
    plan = build_plan(data_root, args.base, args.adapter_size, args.name, run_dir)
    if args.plan_only:
        print(json.dumps({'promoted': False, 'plan': plan}, ensure_ascii=False))
        return 0

    scripts_dir = Path(__file__).resolve().parent
    project_root = scripts_dir.parent
    t_dir = Path(plan['training_data'])
    sft_dir = Path(plan['sft_adapter'])
    dpo_dir = Path(plan['dpo_adapter'])

    try:
        emit('preparing')
        run_step([
            sys.executable, scripts_dir / 'prepare.py',
            '--input', data_root / 'questions.json',
            '--study', data_root / 'study-materials.json',
            '--traces', data_root / 'traces.jsonl',
            '--output', t_dir,
            '--multitask', '--dpo',
        ], project_root)

        emit('training_sft')
        run_step([
            sys.executable, scripts_dir / 'train_lora.py',
            '--data', t_dir,
            '--output', sft_dir,
            '--base', args.base,
            '--adapter-size', args.adapter_size,
            '--epochs', str(args.epochs),
            '--skip-ollama-import',
        ], project_root)

        final_adapter = sft_dir
        dpo_file = t_dir / 'dpo_train.jsonl'
        dpo_lines = [x for x in dpo_file.read_text(encoding='utf-8').splitlines() if x.strip()] if dpo_file.is_file() else []
        if len(dpo_lines) >= 10:
            emit('training_dpo', dpo_pairs=len(dpo_lines))
            run_step([
                sys.executable, scripts_dir / 'train_dpo.py',
                '--data', t_dir,
                '--sft-adapter', sft_dir,
                '--output', dpo_dir,
                '--epochs', '1.0',
            ], project_root)
            final_adapter = dpo_dir

        emit('evaluating')
        eval_out = run_step([
            sys.executable, scripts_dir / 'evaluate.py',
            '--data', t_dir,
            '--adapter', final_adapter,
            '--eval-solver',
        ], project_root)

        report_path = None
        for line in eval_out.splitlines():
            if line.startswith('Rapor:'):
                report_path = Path(line.split('Rapor:', 1)[1].strip())
        if not report_path or not report_path.is_file():
            print(json.dumps({'promoted': False, 'reason': 'Değerlendirme raporu okunamadı.'}, ensure_ascii=False))
            return 0

        report = json.loads(report_path.read_text(encoding='utf-8'))
        ok, detail = should_promote_model(report)
        if not ok:
            print(json.dumps({'promoted': False, 'reason': detail}, ensure_ascii=False))
            return 0

        emit('exporting')
        export_cmd = [
            sys.executable, scripts_dir / 'ollama_export.py',
            '--adapter', final_adapter,
            '--name', args.name,
            '--output-root', data_root / 'exports',
        ]
        if args.llama_dir:
            export_cmd.extend(['--llama-dir', args.llama_dir])
        run_step(export_cmd, project_root)

        print(json.dumps({'promoted': True, 'model': args.name, 'metrics': detail, 'adapter': str(final_adapter)}, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({'promoted': False, 'reason': str(exc)}, ensure_ascii=False))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
