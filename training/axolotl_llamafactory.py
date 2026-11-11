#!/usr/bin/env python3
"""Axolotl & LLaMA-Factory QLoRA (SFT) + DPO (Direct Preference Optimization) Config & Dataset Builder."""
import argparse
import importlib.util
import json
import sys
from pathlib import Path


def probe_modules():
    mods = [
        'torch', 'transformers', 'peft', 'bitsandbytes', 'trl',
        'axolotl', 'llamafactory', 'langgraph', 'autogen', 'crewai'
    ]
    return {m: importlib.util.find_spec(m) is not None for m in mods}


def build_axolotl_qlora_yaml(base_model: str, train_jsonl: str, output_dir: str, lora_r: int = 32, lora_alpha: int = 64, lr: float = 2e-4, epochs: float = 3.0) -> str:
    return f"""# Axolotl QLoRA SFT Konfigürasyonu — Temel Eğitim 5-Kitap Uzmanı
base_model: {base_model}
model_type: AutoModelForCausalLM
tokenizer_type: AutoTokenizer

load_in_8bit: false
load_in_4bit: true
strict: false

datasets:
  - path: {train_jsonl}
    type: alpaca
dataset_prepared_path: {output_dir}/prepared_axolotl_sft
val_set_size: 0.05
output_dir: {output_dir}/axolotl-qlora-sft

sequence_len: 3072
sample_packing: true
pad_to_sequence_len: true

adapter: qlora
lora_r: {lora_r}
lora_alpha: {lora_alpha}
lora_dropout: 0.05
lora_target_linear: true
use_dora: false
neftune_noise_alpha: 5

gradient_accumulation_steps: 4
micro_batch_size: 2
num_epochs: {epochs}
optimizer: paged_adamw_8bit
lr_scheduler: cosine
learning_rate: {lr}

train_on_inputs: false
group_by_length: false
bf16: auto
fp16:
tf32: false

gradient_checkpointing: true
logging_steps: 5
flash_attention: false
warmup_steps: 10
eval_steps: 25
save_steps: 50
"""


def build_axolotl_dpo_yaml(base_model: str, dpo_jsonl: str, output_dir: str, beta: float = 0.1, lora_r: int = 16, lora_alpha: int = 32, lr: float = 5e-5, epochs: float = 1.0) -> str:
    return f"""# Axolotl DPO (Direct Preference Optimization) Konfigürasyonu — Seçilmiş vs Reddedilmiş Tercih Eğitimi
base_model: {base_model}
model_type: AutoModelForCausalLM
tokenizer_type: AutoTokenizer

load_in_4bit: true
rl: dpo
rl_beta: {beta}
chat_template: chatml

datasets:
  - path: {dpo_jsonl}
    type: chatml.argilla
dataset_prepared_path: {output_dir}/prepared_axolotl_dpo
val_set_size: 0.05
output_dir: {output_dir}/axolotl-qlora-dpo

sequence_len: 2048
adapter: qlora
lora_r: {lora_r}
lora_alpha: {lora_alpha}
lora_dropout: 0.05
lora_target_linear: true

gradient_accumulation_steps: 4
micro_batch_size: 1
num_epochs: {epochs}
optimizer: paged_adamw_8bit
lr_scheduler: cosine
learning_rate: {lr}
bf16: auto
gradient_checkpointing: true
logging_steps: 5
save_steps: 25
"""


def build_llamafactory_qlora_yaml(base_model: str, dataset_dir: str, output_dir: str, lora_r: int = 32, lora_alpha: int = 64, lr: float = 2e-4, epochs: float = 3.0) -> str:
    return f"""### LLaMA-Factory QLoRA SFT Konfigürasyonu — Temel Eğitim 5-Kitap Uzmanı
### Model
model_name_or_path: {base_model}
quantization_bit: 4
quantization_method: bitsandbytes

### Yöntem
stage: sft
do_train: true
finetuning_type: lora
lora_target: all
lora_rank: {lora_r}
lora_alpha: {lora_alpha}
lora_dropout: 0.05
neftune_noise_alpha: 5

### Veri Seti
dataset_dir: {dataset_dir}
dataset: temel_egitim_sft
template: qwen
cutoff_len: 3072
overwrite_cache: true
preprocessing_num_workers: 4

### Çıktı & Hiperparametre
output_dir: {output_dir}/llamafactory-qlora-sft
logging_steps: 5
save_steps: 50
plot_loss: true
overwrite_output_dir: true

per_device_train_batch_size: 2
gradient_accumulation_steps: 4
learning_rate: {lr}
num_train_epochs: {epochs}
lr_scheduler_type: cosine
warmup_ratio: 0.05
bf16: true
val_size: 0.05
"""


def build_llamafactory_dpo_yaml(base_model: str, dataset_dir: str, sft_adapter_dir: str, output_dir: str, beta: float = 0.1, lora_r: int = 16, lora_alpha: int = 32, lr: float = 5e-5, epochs: float = 1.0) -> str:
    return f"""### LLaMA-Factory DPO (Direct Preference Optimization) Konfigürasyonu
### Model & SFT Adaptörü
model_name_or_path: {base_model}
adapter_name_or_path: {sft_adapter_dir}
quantization_bit: 4
quantization_method: bitsandbytes

### Yöntem (DPO)
stage: dpo
do_train: true
finetuning_type: lora
lora_target: all
lora_rank: {lora_r}
lora_alpha: {lora_alpha}
pref_beta: {beta}
pref_loss: sigmoid

### Veri Seti (Chosen vs Rejected)
dataset_dir: {dataset_dir}
dataset: temel_egitim_dpo
template: qwen
cutoff_len: 2048
overwrite_cache: true

### Çıktı & Hiperparametre
output_dir: {output_dir}/llamafactory-qlora-dpo
logging_steps: 5
save_steps: 25
plot_loss: true
overwrite_output_dir: true

per_device_train_batch_size: 1
gradient_accumulation_steps: 8
learning_rate: {lr}
num_train_epochs: {epochs}
lr_scheduler_type: cosine
warmup_ratio: 0.05
bf16: true
"""


def build_dataset_info_json() -> dict:
    return {
        "temel_egitim_sft": {
            "file_name": "llamafactory_sft.json",
            "columns": {
                "prompt": "instruction",
                "query": "input",
                "response": "output",
                "system": "system"
            }
        },
        "temel_egitim_dpo": {
            "file_name": "llamafactory_dpo.json",
            "ranking": True,
            "columns": {
                "prompt": "instruction",
                "query": "input",
                "chosen": "chosen",
                "rejected": "rejected",
                "system": "system"
            }
        }
    }


def export_datasets_and_configs(
    *,
    questions_list: list,
    passages_list: list,
    out_dir: Path,
    base_model: str = 'Qwen/Qwen3-8B',
    lora_r: int = 32,
    lora_alpha: int = 64,
    beta: float = 0.1,
) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    cfg_dir = out_dir / 'configs'
    data_dir = out_dir / 'datasets'
    cfg_dir.mkdir(parents=True, exist_ok=True)
    data_dir.mkdir(parents=True, exist_ok=True)

    sys_prompt = 'Sen Türkiye Spor Antrenörlüğü Temel Eğitimi uzman eğitmeni ve ÖSYM düzeyinde soru-çözüm asistanısın.'

    sft_rows_axolotl = []
    sft_rows_lf = []
    approved_by_unit = {}
    rejected_items = []

    for q in questions_list:
        if not isinstance(q, dict) or not q.get('question'):
            continue
        status = q.get('status', 'approved')
        opts = q.get('options') or []
        ans = q.get('answer', '')
        exp = q.get('explanation', '')
        unit_id = q.get('unitId', '0-0')
        unit_name = q.get('unit', 'Temel Eğitim')
        if status == 'approved':
            approved_by_unit.setdefault(unit_id, []).append(q)
            out_txt = json.dumps({
                'question': q.get('question'),
                'options': opts,
                'answer': ans,
                'explanation': exp,
                'difficulty': q.get('difficulty', 'orta'),
            }, ensure_ascii=False)
            inp_txt = f"Ünite: {unit_name} ({unit_id}) | Zorluk: {q.get('difficulty', 'orta')} | Açı: {q.get('questionAngle', 'dogrudan_tanim')}"
            sft_rows_axolotl.append({
                'instruction': 'Verilen ünite bağlamına göre 4 seçenekli, tek doğru yanıtlı ÖSYM kalitesinde Türkçe antrenörlük sorusu üret.',
                'input': inp_txt,
                'output': out_txt,
                'system': sys_prompt,
            })
            sft_rows_lf.append(sft_rows_axolotl[-1])
        else:
            rejected_items.append(q)

    for p in passages_list[:200]:
        if not isinstance(p, dict) or not p.get('text'):
            continue
        title = p.get('heading') or p.get('unit') or 'Temel Eğitim'
        row = {
            'instruction': f"'{title}' konusu hakkında kitabın kaynak pasajından özet çıkar ve sınav tuzaklarını açıkla.",
            'input': f"Kitap: {p.get('book', 'Temel Eğitim')} | Sayfa: {p.get('pages', [])}",
            'output': str(p.get('text', ''))[:900],
            'system': sys_prompt,
        }
        sft_rows_axolotl.append(row)
        sft_rows_lf.append(row)

    # Kod zekası, hata-düzeltme kök-neden analizi, Pythonic/idiyomatik felsefe ve 4-katmanlı soru/çeldirici mühendisliği SFT kayıtları
    code_and_reasoning_sft = [
        (
            'Bir Python fonksiyonunda varsayılan argüman olarak `target=[]` neden hata verir? Pythonic/idiyomatik felsefeyle kök nedenini ve temiz çözümünü açıkla.',
            'Kök Neden: Python varsayılan argümanları her çağrıda değil, fonksiyon tanımlandığı anda YALNIZ BİR KEZ değerlendirir. Bu yüzden ardışık çağrılar aynı liste nesnesini paylaşır ve sessiz veri sızıntısı oluşur.\nPythonic Çözüm: `None` sentinel değeri ve tip ipucu kullanın:\n```python\ndef append_item(val: Any, target: list[Any] | None = None) -> list[Any]:\n    items = [] if target is None else list(target)\n    items.append(val)\n    return items\n```\nFelsefe: Yan etkisiz (side-effect free), okunabilir ve sürprizsiz (Principle of Least Astonishment) kod.'
        ),
        (
            'Python kodunu "Pythonic" ve endüstriyel standartta temiz yapan temel ilkeler nelerdir?',
            'Sözdizimini doğru yazmak yeterli değildir; temiz Python: (1) `range(len(x))` yerine doğrudan yineleme veya `enumerate`, (2) gereksiz döngü yerine anlaşılır `list/dict comprehension` ve jeneratörler (`yield`), (3) `try/except` dar kapsamlı hata yönetimi ve `with` bağlam yöneticileri, (4) `== True` yerine doğruluk değeri (truthiness) ve `is None`, (5) PEP 8 + PEP 484 tip ipuçlarıyla düşük bilişsel karmaşıklık hedefler.'
        ),
        (
            'Sıradan "bana 1 soru yaz" yaklaşımı yerine Katmanlı 4-Aşamalı RAG + Yazar/Çözen/Çeldirici/Editör soru fabrikası nasıl çalışır?',
            '1) Katman: RAG Gen Haritası (MEB/ÖSYM geçmiş soru kalıpları ve kitap alt-bölümleri çıkarılır).\n2) Katman: Yazar Ajan taslağı kurar; Çözen Ajan dış bilgi olmadan tek doğru cevabı bağımsız kanıtlar.\n3) Katman: Çeldirici Mühendisi rastgele yanlış şıklar yerine öğrencinin sık yaptığı birim, yön/düzlem, ters-işlem ve kavram-karıştırma yanılgılarını B/C/D şıklarına yerleştirir.\n4) Katman: Editör Ajan öz-eleştiri yapar, 100-AI konseyi soruyu çözerek kolay/orta/zor/imkansız seviyesini ve tahmini elenme yüzdesini kalibre eder.'
        ),
    ]
    for q_instr, a_out in code_and_reasoning_sft:
        row = {
            'instruction': q_instr,
            'input': 'GitHub Open-Source Bug-Fix, Idiomatic Philosophy & Layered Psychometrics',
            'output': a_out,
            'system': sys_prompt,
        }
        sft_rows_axolotl.append(row)
        sft_rows_lf.append(row)

    # DPO Preference Pairs (Approved vs Rejected OR Rigorous vs Naive Fallback)
    dpo_rows_axolotl = []
    dpo_rows_lf = []
    for r in rejected_items:
        uid = r.get('unitId', '0-0')
        pool = approved_by_unit.get(uid) or next(iter(approved_by_unit.values()), [])
        if not pool:
            continue
        good = pool[len(dpo_rows_axolotl) % len(pool)]
        prompt_str = f"Ünite: {good.get('unit', 'Temel Eğitim')} — 4 seçenekli yüksek kaliteli, tek doğru cevaplı Türkçe soru üret."
        chosen_str = json.dumps({
            'question': good.get('question'),
            'options': good.get('options'),
            'answer': good.get('answer'),
            'explanation': good.get('explanation'),
        }, ensure_ascii=False)
        rejected_str = json.dumps({
            'question': r.get('question'),
            'options': r.get('options'),
            'answer': r.get('answer'),
            'explanation': r.get('explanation') or 'Yetersiz çeldirici veya ikili doğru riski.',
        }, ensure_ascii=False)
        dpo_rows_axolotl.append({
            'system': sys_prompt,
            'instruction': prompt_str,
            'chosen': chosen_str,
            'rejected': rejected_str,
        })
        dpo_rows_lf.append({
            'system': sys_prompt,
            'instruction': prompt_str,
            'input': f"Birim: {uid}",
            'chosen': chosen_str,
            'rejected': rejected_str,
        })

    # Yeterli reddedilmiş soru yoksa onaylı sorulardan ve pasajlardan karşı-örnek (zayıf çeldirici / kaynaksız yanıt) DPO çiftleri üret
    if len(dpo_rows_lf) < 48:
        all_approved = [q for lst in approved_by_unit.values() for q in lst]
        trap_modes = [
            ('İkili doğru ve "Hepsi doğru / Hiçbiri" yasaklı şık içeriyor.', ['Hepsi doğru', 'Hiçbiri']),
            ('Kök ile uyumsuz ve bilimsel dayanaksız çeldiriciler kullanılmış.', ['Bilinmiyor', 'Farketmez']),
            ('Doğru şık aşırı uzun tutularak ve aşırı genelleme ("her zaman/asla") ile ÖSYM simetrisi bozulmuş.', ['Yukarıdakilerin hepsi', 'Hiçbiri (Her zaman yanlış)']),
        ]
        idx = 0
        for good in all_approved:
            for trap_note, bad_tails in trap_modes:
                if len(dpo_rows_lf) >= 48:
                    break
                prompt_str = f"Ünite: {good.get('unit', 'Temel Eğitim')} ({good.get('unitId', '0-0')}) — ÖSYM düzeyinde tek doğru cevaplı soru üret (Varyant #{idx + 1})."
                chosen_str = json.dumps({
                    'question': good.get('question'),
                    'options': good.get('options'),
                    'answer': good.get('answer'),
                    'explanation': good.get('explanation'),
                }, ensure_ascii=False)
                rejected_str = json.dumps({
                    'question': good.get('question'),
                    'options': [good.get('answer'), good.get('answer'), bad_tails[0], bad_tails[1]],
                    'answer': good.get('answer'),
                    'explanation': f'Hatalı tasarım: {trap_note}',
                }, ensure_ascii=False)
                dpo_rows_axolotl.append({
                    'system': sys_prompt,
                    'instruction': prompt_str,
                    'chosen': chosen_str,
                    'rejected': rejected_str,
                })
                dpo_rows_lf.append({
                    'system': sys_prompt,
                    'instruction': prompt_str,
                    'input': f"Sentetik Soru DPO #{idx + 1}",
                    'chosen': chosen_str,
                    'rejected': rejected_str,
                })
                idx += 1
        for p in passages_list:
            if len(dpo_rows_lf) >= 16:
                break
            if not isinstance(p, dict) or not p.get('text'):
                continue
            title = p.get('heading') or p.get('unit') or 'Temel Eğitim'
            for k in range(3):
                if len(dpo_rows_lf) >= 16:
                    break
                prompt_str = f"'{title}' ({p.get('book', 'Temel Eğitim')}) için kaynak kanıtlı sınav özeti yaz (#{k + 1})."
                chosen_str = str(p.get('text', ''))[:650]
                rejected_str = f"{title} hakkında genel bilgi: Sporcular her zaman çok antrenman yapmalıdır (kaynak sayfa/terim belirtilmemiş yüzeysel özet #{k + 1})."
                dpo_rows_axolotl.append({
                    'system': sys_prompt,
                    'instruction': prompt_str,
                    'chosen': chosen_str,
                    'rejected': rejected_str,
                })
                dpo_rows_lf.append({
                    'system': sys_prompt,
                    'instruction': prompt_str,
                    'input': f"Pasaj DPO #{len(dpo_rows_lf) + 1}",
                    'chosen': chosen_str,
                    'rejected': rejected_str,
                })
    # En az 12 DPO çifti garanti et (TRL DPOTrainer alt sınırı >= 10)
    seed_dpo_topics = [
        ('ATP-CP Anaerobik Alaktik Sistem', '0-10 saniyelik maksimal patlayıcı eforlarda baskındır; laktik asit biriktirmez.', 'Uzun maraton koşularında ana enerji kaynağıdır.'),
        ('VO2max Aerobik Güç', 'Maksimal egzersiz sırasında vücudun birim zamanda tüketebildiği en yüksek oksijen miktarıdır (ml/kg/dk).', 'Yalnızca esneklik ve denge performansını ölçer.'),
        ('Anaerobik Laktat Eşiği', 'Kan laktat birikiminin temizlenme hızını aştığı şiddet bölgesidir.', 'İstirahat nabzının altına düşüldüğü dinlenme anıdır.'),
        ('Süperkompansasyon İlkesi', 'Yüklenme ve yeterli toparlanma sonrası organizmanın başlangıç düzeyinin üzerine çıkmasıdır.', 'Dinlenme vermeden her gün art arda maksimal yüklenmektir.'),
        ('İzometrik Kas Kasılması', 'Eklem açısı ve kas boyu değişmeden yüksek gerim üretilen statik kasılma türüdür.', 'Kasın kısaldığı tek dinamik sıçrama hareketidir.'),
        ('Eksantrik Kas Kasılması', 'Dış direnç altında kasın uzayarak frenleme yaptığı kasılma fazıdır.', 'Sıfır dirençle eklemin sabit kalmasıdır.'),
        ('İçsel Güdülenme (Motivasyon)', 'Sporcunun ödülden bağımsız, öğrenme ve başarma hazzıyla etkinliğe katılmasıdır.', 'Sadece para ödülü ve ceza korkusuyla antrenmana gelmektir.'),
        ('Spor Ahlakı ve Fair-Play', 'Kurala uymanın ötesinde rakibe saygı ve dürüst rekabet erdemini benimsemektir.', 'Hakem görmediğinde avantaj sağlamak için kural esnetmektir.'),
        ('Antrenman Periyotlaması (Makro/Mezo/Mikro)', 'Yıllık hedefe göre yüklenme-dinlenme dalgalarını sistematik dönemlere ayırmaktır.', 'Tüm yıl aynı tekdüze antrenmanı hiç değiştirmeden yapmaktır.'),
        ('Doping ve WADA Yasaklı Listesi', 'Sporcu sağlığına zarar veren, performansı yapay artıran ve etik dışı yöntemlerdir.', 'Spor hekimi kontrolünde yapılan dengeli su ve elektrolit takviyesidir.'),
        ('Motor Öğrenmede Geri Bildirim', 'Beceri ediniminde içsel kinestetik his ve antrenörün zamanında bilgi vermesidir.', 'Hatayı hiç düzeltmeden rastgele tekrar ettirmektir.'),
        ('Kardiyovasküler Uyum (Sporcu Kalbi)', 'Düzenli dayanıklılık antrenmanı sonucu atım hacminin artıp istirahat nabzının düşmesidir.', 'İstirahat kalp atım hızının sürekli 110 atım/dk üstüne çıkmasıdır.')
    ]
    for idx, (topic, good_txt, bad_txt) in enumerate(seed_dpo_topics):
        if len(dpo_rows_lf) >= 14:
            break
        prompt_str = f"{topic} konusunda ÖSYM düzeyinde doğru tanım ve bilimsel açıklama üret (#{idx + 1})."
        dpo_rows_axolotl.append({
            'system': sys_prompt,
            'instruction': prompt_str,
            'chosen': good_txt,
            'rejected': bad_txt,
        })
        dpo_rows_lf.append({
            'system': sys_prompt,
            'instruction': prompt_str,
            'input': f"Çekirdek Terim DPO #{idx + 1}",
            'chosen': good_txt,
            'rejected': bad_txt,
        })

    ax_sft_path = data_dir / 'axolotl_sft.jsonl'
    ax_dpo_path = data_dir / 'axolotl_dpo.jsonl'
    lf_sft_path = data_dir / 'llamafactory_sft.json'
    lf_dpo_path = data_dir / 'llamafactory_dpo.json'
    lf_info_path = data_dir / 'dataset_info.json'

    ax_sft_path.write_text('\n'.join(json.dumps(x, ensure_ascii=False) for x in sft_rows_axolotl) + ('\n' if sft_rows_axolotl else ''), encoding='utf-8')
    ax_dpo_path.write_text('\n'.join(json.dumps(x, ensure_ascii=False) for x in dpo_rows_axolotl) + ('\n' if dpo_rows_axolotl else ''), encoding='utf-8')
    lf_sft_path.write_text(json.dumps(sft_rows_lf, ensure_ascii=False, indent=2), encoding='utf-8')
    lf_dpo_path.write_text(json.dumps(dpo_rows_lf, ensure_ascii=False, indent=2), encoding='utf-8')
    lf_info_path.write_text(json.dumps(build_dataset_info_json(), ensure_ascii=False, indent=2), encoding='utf-8')

    ax_qlora_yml = cfg_dir / 'axolotl_qlora.yml'
    ax_dpo_yml = cfg_dir / 'axolotl_dpo.yml'
    lf_qlora_yml = cfg_dir / 'llamafactory_qlora.yaml'
    lf_dpo_yml = cfg_dir / 'llamafactory_dpo.yaml'

    ax_qlora_txt = build_axolotl_qlora_yaml(base_model, str(ax_sft_path), str(out_dir / 'outputs'), lora_r=lora_r, lora_alpha=lora_alpha)
    ax_dpo_txt = build_axolotl_dpo_yaml(base_model, str(ax_dpo_path), str(out_dir / 'outputs'), beta=beta)
    lf_qlora_txt = build_llamafactory_qlora_yaml(base_model, str(data_dir), str(out_dir / 'outputs'), lora_r=lora_r, lora_alpha=lora_alpha)
    lf_dpo_txt = build_llamafactory_dpo_yaml(base_model, str(data_dir), str(out_dir / 'outputs' / 'llamafactory-qlora-sft'), str(out_dir / 'outputs'), beta=beta)

    ax_qlora_yml.write_text(ax_qlora_txt, encoding='utf-8')
    ax_dpo_yml.write_text(ax_dpo_txt, encoding='utf-8')
    lf_qlora_yml.write_text(lf_qlora_txt, encoding='utf-8')
    lf_dpo_yml.write_text(lf_dpo_txt, encoding='utf-8')

    return {
        'ok': True,
        'baseModel': base_model,
        'sftCount': len(sft_rows_lf),
        'dpoPairCount': len(dpo_rows_lf),
        'files': {
            'axolotlSftConfig': str(ax_qlora_yml),
            'axolotlDpoConfig': str(ax_dpo_yml),
            'axolotlSftData': str(ax_sft_path),
            'axolotlDpoData': str(ax_dpo_path),
            'llamafactorySftConfig': str(lf_qlora_yml),
            'llamafactoryDpoConfig': str(lf_dpo_yml),
            'llamafactoryDatasetInfo': str(lf_info_path),
            'llamafactorySftData': str(lf_sft_path),
            'llamafactoryDpoData': str(lf_dpo_path),
        },
        'commands': {
            'axolotlQlora': f"accelerate launch -m axolotl.cli.train {ax_qlora_yml}",
            'axolotlDpo': f"accelerate launch -m axolotl.cli.train {ax_dpo_yml}",
            'llamafactoryQlora': f"llamafactory-cli train {lf_qlora_yml}",
            'llamafactoryDpo': f"llamafactory-cli train {lf_dpo_yml}",
        },
        'previews': {
            'axolotlQloraYaml': ax_qlora_txt,
            'axolotlDpoYaml': ax_dpo_txt,
            'llamafactoryQloraYaml': lf_qlora_txt,
            'llamafactoryDpoYaml': lf_dpo_txt,
        }
    }


def main():
    ap = argparse.ArgumentParser(description='Axolotl & LLaMA-Factory QLoRA + DPO Üreticisi')
    ap.add_argument('--status', action='store_true')
    ap.add_argument('--data-dir', default='.tempo-data')
    ap.add_argument('--base-model', default='Qwen/Qwen3-8B')
    ap.add_argument('--lora-r', type=int, default=32)
    ap.add_argument('--lora-alpha', type=int, default=64)
    ap.add_argument('--beta', type=float, default=0.1)
    args = ap.parse_args()

    if args.status:
        print(json.dumps({'ok': True, 'modules': probe_modules(), 'python': sys.executable}, ensure_ascii=False))
        return 0

    data_root = Path(args.data_dir).expanduser().resolve()
    q_file = data_root / 'questions.json'
    questions = []
    if q_file.is_file():
        try:
            raw = json.loads(q_file.read_text(encoding='utf-8'))
            questions = raw.get('items', []) if isinstance(raw, dict) else (raw if isinstance(raw, list) else [])
        except Exception:
            questions = []

    p_file = Path(__file__).resolve().parent.parent / 'server' / 'book-passages.json'
    passages = []
    if p_file.is_file():
        try:
            raw_p = json.loads(p_file.read_text(encoding='utf-8'))
            if isinstance(raw_p, dict) and isinstance(raw_p.get('units'), list):
                for u in raw_p['units']:
                    uid = u.get('id', '0-0')
                    for item in u.get('passages', []):
                        if isinstance(item, dict):
                            passages.append({**item, 'unitId': uid, 'book': u.get('book', ''), 'unit': u.get('unit', '')})
            elif isinstance(raw_p, dict):
                for uid, arr in raw_p.items():
                    if isinstance(arr, list):
                        for item in arr:
                            if isinstance(item, dict):
                                passages.append({**item, 'unitId': uid})
        except Exception:
            passages = []

    server_dir = Path(__file__).resolve().parent.parent / 'server'
    seen_q = {str(q.get('question', '')).strip().lower() for q in questions if isinstance(q, dict)}

    for extra_name, max_items in [('book-style-questions.json', 300), ('question-bank.json', 400)]:
        ex_file = server_dir / extra_name
        if ex_file.is_file():
            try:
                raw_ex = json.loads(ex_file.read_text(encoding='utf-8'))
                arr = raw_ex.get('questions', []) if isinstance(raw_ex, dict) else (raw_ex if isinstance(raw_ex, list) else [])
                for item in arr[:max_items]:
                    if isinstance(item, dict):
                        stem_k = str(item.get('question', '')).strip().lower()
                        if stem_k and stem_k not in seen_q:
                            seen_q.add(stem_k)
                            questions.append({**item, 'status': item.get('status', 'approved')})
            except Exception:
                pass

    res = export_datasets_and_configs(
        questions_list=questions,
        passages_list=passages,
        out_dir=data_root / 'training-hub',
        base_model=args.base_model,
        lora_r=args.lora_r,
        lora_alpha=args.lora_alpha,
        beta=args.beta,
    )
    res['modules'] = probe_modules()
    print(json.dumps(res, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
