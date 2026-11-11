import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

export const FREE_VOICESTUDIO_CATALOG = [
 // 1. Yerel VoiceStudio & OmniVoice Tasarım Profilleri (port 3900 canlıysa gerçek sinirsel TTS, değilse çoklu ücretsiz yedeklerle çalışır)
 { id: 'voicestudio:demo0001', provider: 'voicestudio', voice: 'demo0001', model: 'omnivoice', label: 'VoiceStudio • Demo Voice', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'neutral', pitch: 1.0, rate: 1.0, emoji: '🎛️', description: 'VoiceStudio yerel varsayılan stüdyo sesi', instruct: 'young adult, moderate pitch' },
 { id: 'voicestudio:the_teacher', provider: 'voicestudio', voice: 'the_teacher', model: 'omnivoice', label: 'The Teacher • Eğitmen', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'female', pitch: 1.06, rate: 0.96, emoji: '🎓', description: 'Net ve öğretici sınıf öğretmeni tonu', instruct: 'female, middle-aged, moderate pitch, american accent' },
 { id: 'voicestudio:the_explainer', provider: 'voicestudio', voice: 'the_explainer', model: 'omnivoice', label: 'The Explainer • Açıklayıcı', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 0.96, rate: 1.0, emoji: '💡', description: 'Kavramları sade ve anlaşılır açan anlatıcı', instruct: 'male, young adult, moderate pitch, british accent' },
 { id: 'voicestudio:the_librarian', provider: 'voicestudio', voice: 'the_librarian', model: 'omnivoice', label: 'The Librarian • Kitap Anlatıcısı', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'female', pitch: 0.94, rate: 0.92, emoji: '📚', description: 'Sıcak ve akıcı ders kitabı okuyucusu', instruct: 'female, middle-aged, low pitch, british accent' },
 { id: 'voicestudio:the_anchor', provider: 'voicestudio', voice: 'the_anchor', model: 'omnivoice', label: 'The Anchor • Haber Spikeri', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 0.92, rate: 1.04, emoji: '📺', description: 'Güven veren net spiker tonlaması', instruct: 'male, middle-aged, moderate pitch, american accent' },
 { id: 'voicestudio:the_commentator', provider: 'voicestudio', voice: 'the_commentator', model: 'omnivoice', label: 'The Commentator • Maç Spikeri', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 1.08, rate: 1.15, emoji: '🏟️', description: 'Coşkulu ve hızlı stadyum spikeri', instruct: 'male, middle-aged, high pitch, british accent' },
 { id: 'voicestudio:the_documentarian', provider: 'voicestudio', voice: 'the_documentarian', model: 'omnivoice', label: 'The Documentarian • Belgesel', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 0.86, rate: 0.94, emoji: '🎬', description: 'Derin, sakin ve odaklanmayı artıran ses', instruct: 'male, middle-aged, low pitch, american accent' },
 { id: 'voicestudio:the_storyteller', provider: 'voicestudio', voice: 'the_storyteller', model: 'omnivoice', label: 'The Storyteller • Bilge Hikâyeci', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 0.84, rate: 0.9, emoji: '🪄', description: 'Akılda kalıcı hikâye ve benzetme anlatıcısı', instruct: 'male, elderly, low pitch, british accent' },
 { id: 'voicestudio:the_calm_guide', provider: 'voicestudio', voice: 'the_calm_guide', model: 'omnivoice', label: 'The Calm Guide • Sakin Rehber', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'female', pitch: 0.95, rate: 0.88, emoji: '🌙', description: 'Yumuşak ve fısıltıya yakın dikkat toplayıcı', instruct: 'female, middle-aged, low pitch, whisper' },
 { id: 'voicestudio:the_neighbor', provider: 'voicestudio', voice: 'the_neighbor', model: 'omnivoice', label: 'The Neighbor • Samimi Diyalog', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'female', pitch: 1.08, rate: 1.02, emoji: '😊', description: 'Günlük ve sıcak sohbet tonu', instruct: 'female, young adult, moderate pitch, american accent' },
 { id: 'voicestudio:the_helpdesk', provider: 'voicestudio', voice: 'the_helpdesk', model: 'omnivoice', label: 'The Helpdesk • Sabırlı Rehber', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'female', pitch: 1.04, rate: 0.96, emoji: '🎧', description: 'Sakin ve adım adım destek veren ses', instruct: 'female, young adult, moderate pitch, indian accent' },
 { id: 'voicestudio:the_mate', provider: 'voicestudio', voice: 'the_mate', model: 'omnivoice', label: 'The Mate • Antrenman Arkadaşı', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 1.0, rate: 1.04, emoji: '💬', description: 'Doğal, enerjik saha arkadaşı', instruct: 'male, young adult, moderate pitch, australian accent' },
 { id: 'voicestudio:the_companion', provider: 'voicestudio', voice: 'the_companion', model: 'omnivoice', label: 'The Companion • Çalışma Ortağı', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'female', pitch: 1.02, rate: 0.98, emoji: '☕', description: 'Uzun okumalarda yormayan eşlikçi', instruct: 'female, middle-aged, moderate pitch, canadian accent' },
 { id: 'voicestudio:captain_crusty', provider: 'voicestudio', voice: 'captain_crusty', model: 'omnivoice', label: 'Captain Crusty • Sert Komedi', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 0.76, rate: 1.08, emoji: '🏴‍☠️', description: 'Kalın, esprili çizgi film karakteri (Kayseri/Komedi uyumlu)', instruct: 'male, elderly, very low pitch' },
 { id: 'voicestudio:junior_quacks', provider: 'voicestudio', voice: 'junior_quacks', model: 'omnivoice', label: 'Junior Quacks • Hızlı Komedi', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'neutral', pitch: 1.38, rate: 1.18, emoji: '🐤', description: 'Yüksek perdeli, yaramaz çizgi film sesi (Böcü uyumlu)', instruct: 'teenager, high pitch' },
 { id: 'voicestudio:the_champion', provider: 'voicestudio', voice: 'the_champion', model: 'omnivoice', label: 'The Champion • Şampiyon Koç', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 1.02, rate: 1.1, emoji: '🛡️', description: 'Motive edici atletik antrenör sesi', instruct: 'male, young adult, high pitch, american accent' },
 { id: 'voicestudio:the_pixie', provider: 'voicestudio', voice: 'the_pixie', model: 'omnivoice', label: 'The Pixie • Çok İnce Neşeli', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'female', pitch: 1.46, rate: 1.16, emoji: '✨', description: 'Küçük, hareketli animasyon karakteri', instruct: 'female, child, very high pitch' },
 { id: 'voicestudio:the_ogre', provider: 'voicestudio', voice: 'the_ogre', model: 'omnivoice', label: 'The Ogre • Dev Bas Ses', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 0.72, rate: 0.9, emoji: '👹', description: 'Aşırı kalın eğlenceli karakter sesi', instruct: 'male, middle-aged, very low pitch' },
 { id: 'voicestudio:the_podcaster', provider: 'voicestudio', voice: 'the_podcaster', model: 'omnivoice', label: 'The Podcaster • Enerjik Sunum', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'female', pitch: 1.16, rate: 1.1, emoji: '🎙️', description: 'Canlı podcast ve sesli özet temposu', instruct: 'female, young adult, high pitch, australian accent' },
 { id: 'voicestudio:the_hype_host', provider: 'voicestudio', voice: 'the_hype_host', model: 'omnivoice', label: 'The Hype Host • TikTok Hızlı', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 1.18, rate: 1.2, emoji: '⚡', description: 'TikTok/Shorts akışı için yüksek tempo', instruct: 'male, young adult, very high pitch, american accent' },
 { id: 'voicestudio:the_vlogger', provider: 'voicestudio', voice: 'the_vlogger', model: 'omnivoice', label: 'The Vlogger • Doğal Genç', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'female', pitch: 1.15, rate: 1.08, emoji: '📹', description: 'Samimi genç öğrenci & vlogger tonu', instruct: 'female, young adult, high pitch' },
 { id: 'voicestudio:the_game_host', provider: 'voicestudio', voice: 'the_game_host', model: 'omnivoice', label: 'The Game Host • Quiz Sunucusu', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 1.0, rate: 1.08, emoji: '🎯', description: 'Test merkezi için heyecanlı sunucu', instruct: 'male, middle-aged, moderate pitch' },
 { id: 'voicestudio:the_promo', provider: 'voicestudio', voice: 'the_promo', model: 'omnivoice', label: 'The Promo • Güçlü Vurgu', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 0.88, rate: 1.05, emoji: '📣', description: 'Kilit kelimeleri zihne kazıyan vurgu', instruct: 'male, middle-aged, low pitch' },
 { id: 'voicestudio:the_luxe', provider: 'voicestudio', voice: 'the_luxe', model: 'omnivoice', label: 'The Luxe • Zarif Anlatım', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'female', pitch: 0.99, rate: 0.98, emoji: '💎', description: 'Dengeli, akıcı ve premium sunum sesi', instruct: 'female, middle-aged, moderate pitch, british accent' },
 { id: 'voicestudio:the_upbeat', provider: 'voicestudio', voice: 'the_upbeat', model: 'omnivoice', label: 'The Upbeat • Neşeli Tempocu', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'female', pitch: 1.18, rate: 1.12, emoji: '🎵', description: 'Pozitif ve enerji veren seslendirme', instruct: 'female, young adult, high pitch, american accent' },
 { id: 'voicestudio:ml_narrator', provider: 'voicestudio', voice: 'ml_narrator', model: 'omnivoice', label: 'VoiceStudio • Çok Dilli Narrator', category: 'VoiceStudio Yerel', language: '646 Dil / Türkçe', gender: 'female', pitch: 0.93, rate: 0.94, emoji: '🌍', description: 'VoiceStudio evrensel çok dilli kitap anlatıcısı', instruct: 'female, middle-aged, low pitch' },
 { id: 'voicestudio:ml_explainer', provider: 'voicestudio', voice: 'ml_explainer', model: 'omnivoice', label: 'VoiceStudio • Çok Dilli Explainer', category: 'VoiceStudio Yerel', language: '646 Dil / Türkçe', gender: 'male', pitch: 0.98, rate: 1.0, emoji: '🧭', description: 'VoiceStudio evrensel çok dilli ders eğitmeni', instruct: 'male, young adult, moderate pitch' },
 { id: 'voicestudio:ml_companion', provider: 'voicestudio', voice: 'ml_companion', model: 'omnivoice', label: 'VoiceStudio • Çok Dilli Companion', category: 'VoiceStudio Yerel', language: '646 Dil / Türkçe', gender: 'female', pitch: 1.07, rate: 1.02, emoji: '🗣️', description: 'VoiceStudio evrensel çok dilli samimi diyalog', instruct: 'female, young adult, moderate pitch' },

 // 2. Ücretsiz Anahtarsız Speechify (simba-multilingual — DilKoç'taki gibi 0-API)
 { id: 'speechify:geffen_32', provider: 'speechify', voice: 'geffen_32', model: 'simba-multilingual', label: 'Geffen • Sıcak & Dengeli', category: 'Speechify Free', language: 'Türkçe Çok Dilli', gender: 'male', pitch: 0.98, rate: 1.0, emoji: '🌿', description: 'Ders anlatımları için sıcak, yormayan ses' },
 { id: 'speechify:dominic_32', provider: 'speechify', voice: 'dominic_32', model: 'simba-multilingual', label: 'Dominic • Net & Enerjik Koç', category: 'Speechify Free', language: 'Türkçe Çok Dilli', gender: 'male', pitch: 1.02, rate: 1.08, emoji: '⚡', description: 'Hızlı, net ve enerjik antrenör sesi' },
 { id: 'speechify:harper_32', provider: 'speechify', voice: 'harper_32', model: 'simba-multilingual', label: 'Harper • Yumuşak Anlatım', category: 'Speechify Free', language: 'Türkçe Çok Dilli', gender: 'female', pitch: 1.06, rate: 0.96, emoji: '🌙', description: 'Uzun açıklamalar ve tekrarlar için yumuşak ton' },
 { id: 'speechify:hugh_32', provider: 'speechify', voice: 'hugh_32', model: 'simba-multilingual', label: 'Hugh • Tok Radyo Spikeri', category: 'Speechify Free', language: 'Türkçe Çok Dilli', gender: 'male', pitch: 0.88, rate: 1.0, emoji: '🎙️', description: 'Tok, radyo spikeri tarzı güvenilir AI sesi' },
 { id: 'speechify:emily_32', provider: 'speechify', voice: 'emily_32', model: 'simba-multilingual', label: 'Emily • Akıcı Kadın', category: 'Speechify Free', language: 'Türkçe Çok Dilli', gender: 'female', pitch: 1.1, rate: 1.02, emoji: '☀️', description: 'Canlı ve akıcı Türkçe okuma' },
 { id: 'speechify:henry_32', provider: 'speechify', voice: 'henry_32', model: 'simba-multilingual', label: 'Henry • Akademik Hoca', category: 'Speechify Free', language: 'Türkçe Çok Dilli', gender: 'male', pitch: 0.92, rate: 0.95, emoji: '🏛️', description: 'Konu özeti ve tanımlar için oturaklı ton' },
 { id: 'speechify:erin_32', provider: 'speechify', voice: 'erin_32', model: 'simba-multilingual', label: 'Erin • Dinamik Anlatıcı', category: 'Speechify Free', language: 'Türkçe Çok Dilli', gender: 'female', pitch: 1.12, rate: 1.06, emoji: '🌟', description: 'Kısa terim kartları için vurgulu kadın sesi' },
 { id: 'speechify:lauren_32', provider: 'speechify', voice: 'lauren_32', model: 'simba-multilingual', label: 'Lauren • Doğal Öğretmen', category: 'Speechify Free', language: 'Türkçe Çok Dilli', gender: 'female', pitch: 1.04, rate: 0.98, emoji: '📖', description: 'Doğal vurgulu ders rehberi' },

 // 3. Ücretsiz Anahtarsız OpenAI TTS Profilleri (gpt-4o-mini-tts — 0-API)
 { id: 'openai:alloy', provider: 'openai', voice: 'alloy', model: 'gpt-4o-mini-tts', label: 'Alloy • Canlı', category: 'OpenAI Free', language: 'Türkçe Çok Dilli', gender: 'neutral', pitch: 1.02, rate: 1.02, emoji: '🪩', description: 'Dengeli ve canlı genel anlatım' },
 { id: 'openai:ash', provider: 'openai', voice: 'ash', model: 'gpt-4o-mini-tts', label: 'Ash • Kararlı Koç', category: 'OpenAI Free', language: 'Türkçe Çok Dilli', gender: 'male', pitch: 0.92, rate: 1.04, emoji: '🔥', description: 'Keskin ve motive edici koç vurgusu' },
 { id: 'openai:ballad', provider: 'openai', voice: 'ballad', model: 'gpt-4o-mini-tts', label: 'Ballad • Dramatik Hikâye', category: 'OpenAI Free', language: 'Türkçe Çok Dilli', gender: 'male', pitch: 0.95, rate: 0.96, emoji: '🎭', description: 'Vaka analizi ve hikâye anlatımı' },
 { id: 'openai:coral', provider: 'openai', voice: 'coral', model: 'gpt-4o-mini-tts', label: 'Coral • Sıcak Eğitmen', category: 'OpenAI Free', language: 'Türkçe Çok Dilli', gender: 'female', pitch: 1.08, rate: 1.0, emoji: '🌸', description: 'Samimi, net ve teşvik edici eğitmen' },
 { id: 'openai:echo', provider: 'openai', voice: 'echo', model: 'gpt-4o-mini-tts', label: 'Echo • Derin Stüdyo', category: 'OpenAI Free', language: 'Türkçe Çok Dilli', gender: 'male', pitch: 0.88, rate: 0.98, emoji: '🎧', description: 'Derin stüdyo anlatıcısı' },
 { id: 'openai:fable', provider: 'openai', voice: 'fable', model: 'gpt-4o-mini-tts', label: 'Fable • İfadeli', category: 'OpenAI Free', language: 'Türkçe Çok Dilli', gender: 'neutral', pitch: 1.05, rate: 1.0, emoji: '📖', description: 'Kodlama ve akrostişler için ifadeli ses' },
 { id: 'openai:nova', provider: 'openai', voice: 'nova', model: 'gpt-4o-mini-tts', label: 'Nova • Parlak & Hızlı', category: 'OpenAI Free', language: 'Türkçe Çok Dilli', gender: 'female', pitch: 1.12, rate: 1.06, emoji: '🌟', description: 'Hızlı tekrar ve enerji dolu sunum' },
 { id: 'openai:onyx', provider: 'openai', voice: 'onyx', model: 'gpt-4o-mini-tts', label: 'Onyx • Kalın Otoriter', category: 'OpenAI Free', language: 'Türkçe Çok Dilli', gender: 'male', pitch: 0.82, rate: 0.95, emoji: '🪨', description: 'Sınav kuralları için kalın ve tok ton' },
 { id: 'openai:sage', provider: 'openai', voice: 'sage', model: 'gpt-4o-mini-tts', label: 'Sage • Bilge Profesör', category: 'OpenAI Free', language: 'Türkçe Çok Dilli', gender: 'female', pitch: 0.96, rate: 0.94, emoji: '🦉', description: 'Ağırbaşlı ve akılcı ders danışmanı' },
 { id: 'openai:shimmer', provider: 'openai', voice: 'shimmer', model: 'gpt-4o-mini-tts', label: 'Shimmer • Pozitif', category: 'OpenAI Free', language: 'Türkçe Çok Dilli', gender: 'female', pitch: 1.1, rate: 1.02, emoji: '✨', description: 'Akıcı, parlak ve pozitif anlatım' },
 { id: 'openai:verse', provider: 'openai', voice: 'verse', model: 'gpt-4o-mini-tts', label: 'Verse • Sahne Spikeri', category: 'OpenAI Free', language: 'Türkçe Çok Dilli', gender: 'male', pitch: 1.0, rate: 1.06, emoji: '🎬', description: 'Sahne diyalogları için dinamik ses' },

 // 4. Ücretsiz Anahtarsız ElevenLabs Profilleri (eleven_multilingual_v2 — 0-API)
 { id: 'elevenlabs:rachel', provider: 'elevenlabs', voice: '21m00Tcm4TlvDq8ikWAM', model: 'eleven_multilingual_v2', label: 'Rachel • Doğal Çok Dilli', category: 'ElevenLabs Free', language: 'Türkçe Çok Dilli', gender: 'female', pitch: 1.06, rate: 1.0, emoji: '✨', description: 'Yumuşak, doğal çok dilli kadın sesi' },
 { id: 'elevenlabs:sarah', provider: 'elevenlabs', voice: 'EXAVITQu4vr4xnSDxMaL', model: 'eleven_multilingual_v2', label: 'Sarah • Sıcak Rehber', category: 'ElevenLabs Free', language: 'Türkçe Çok Dilli', gender: 'female', pitch: 1.08, rate: 0.98, emoji: '🌺', description: 'Net telaffuzlu sakin ders anlatıcısı' },
 { id: 'elevenlabs:antoni', provider: 'elevenlabs', voice: 'ErXwobaYiN019PkySvjV', model: 'eleven_multilingual_v2', label: 'Antoni • Dengeli Erkek', category: 'ElevenLabs Free', language: 'Türkçe Çok Dilli', gender: 'male', pitch: 0.98, rate: 1.02, emoji: '🎯', description: 'Çok amaçlı temiz Türkçe okuma' },
 { id: 'elevenlabs:josh', provider: 'elevenlabs', voice: 'TxGEqnHWrfWFTfGW9XjX', model: 'eleven_multilingual_v2', label: 'Josh • Güçlü Sunucu', category: 'ElevenLabs Free', language: 'Türkçe Çok Dilli', gender: 'male', pitch: 0.9, rate: 1.04, emoji: '📣', description: 'Derin ve vurgulu sınav koçu' },
 { id: 'elevenlabs:arnold', provider: 'elevenlabs', voice: 'VR6AewLTigWG4xSOukaG', model: 'eleven_multilingual_v2', label: 'Arnold • Sert Antrenör', category: 'ElevenLabs Free', language: 'Türkçe Çok Dilli', gender: 'male', pitch: 0.84, rate: 1.0, emoji: '🏋️', description: 'Sert disiplinli antrenman komutu' },
 { id: 'elevenlabs:adam', provider: 'elevenlabs', voice: 'pNInz6obpgDQGcFmaJgB', model: 'eleven_multilingual_v2', label: 'Adam • Belgesel Narratör', category: 'ElevenLabs Free', language: 'Türkçe Çok Dilli', gender: 'male', pitch: 0.86, rate: 0.96, emoji: '🎤', description: 'Orta-kalın profesyonel anlatıcı' },
 { id: 'elevenlabs:sam', provider: 'elevenlabs', voice: 'yoZ06aMxZJJ28mfd3POQ', model: 'eleven_multilingual_v2', label: 'Sam • Dinamik Genç', category: 'ElevenLabs Free', language: 'Türkçe Çok Dilli', gender: 'male', pitch: 1.04, rate: 1.08, emoji: '🚀', description: 'Hızlı ve enerjik genç anlatıcı' },

 // 5. Ücretsiz Çevrimdışı Türkçe Karakter DSP Profilleri (Her cihazda internet olmasa bile anında!)
 { id: 'local:kayseri_koc', provider: 'local-dsp', voice: 'kayseri_koc', model: 'web-speech-dsp', label: 'Kayserili Koç • Sert Komedi', category: 'Türkçe Karakter DSP', language: 'Türkçe (tr-TR)', gender: 'male', pitch: 0.86, rate: 1.14, emoji: '🌶️', description: 'Kayseri şiveli hızlı & sert komedi koçu' },
 { id: 'local:bocu_komedi', provider: 'local-dsp', voice: 'bocu_komedi', model: 'web-speech-dsp', label: 'Hamam Böceği Böcü • İnce Komedi', category: 'Türkçe Karakter DSP', language: 'Türkçe (tr-TR)', gender: 'neutral', pitch: 1.52, rate: 1.26, emoji: '🪳', description: 'Yüksek perdeli şapşal çizgi karakter' },
 { id: 'local:ada_sporcu', provider: 'local-dsp', voice: 'ada_sporcu', model: 'web-speech-dsp', label: 'Ada • Enerjik Sporcu', category: 'Türkçe Karakter DSP', language: 'Türkçe (tr-TR)', gender: 'female', pitch: 1.18, rate: 1.06, emoji: '🏃‍♀️', description: 'Meraklı ve zeki sporcu öğrenci sesi' },
 { id: 'local:can_ogrenci', provider: 'local-dsp', voice: 'can_ogrenci', model: 'web-speech-dsp', label: 'Can • Tuzak Soran Öğrenci', category: 'Türkçe Karakter DSP', language: 'Türkçe (tr-TR)', gender: 'male', pitch: 1.02, rate: 1.0, emoji: '🤔', description: 'Doğal erkek öğrenci sesi' },
 { id: 'local:prof_bilge', provider: 'local-dsp', voice: 'prof_bilge', model: 'web-speech-dsp', label: 'Bilge Profesör • Akademik', category: 'Türkçe Karakter DSP', language: 'Türkçe (tr-TR)', gender: 'male', pitch: 0.82, rate: 0.92, emoji: '🎓', description: 'Ağır, net ve detaylı ders anlatımı' },
 { id: 'local:stadyum_spiker', provider: 'local-dsp', voice: 'stadyum_spiker', model: 'web-speech-dsp', label: 'Stadyum Spikeri • 90. Dakika', category: 'Türkçe Karakter DSP', language: 'Türkçe (tr-TR)', gender: 'male', pitch: 1.08, rate: 1.2, emoji: '🏟️', description: 'Canlı maç anlatımı heyecanı' },
 { id: 'local:sakin_mentor', provider: 'local-dsp', voice: 'sakin_mentor', model: 'web-speech-dsp', label: 'Sakin Mentor • Rahatlatıcı', category: 'Türkçe Karakter DSP', language: 'Türkçe (tr-TR)', gender: 'female', pitch: 0.96, rate: 0.88, emoji: '🌿', description: 'Uzun üniteleri dinlendirici hızda okur' },
 { id: 'local:turbo_shorts', provider: 'local-dsp', voice: 'turbo_shorts', model: 'web-speech-dsp', label: 'Turbo Shorts • Hızlı Ezber', category: 'Türkçe Karakter DSP', language: 'Türkçe (tr-TR)', gender: 'neutral', pitch: 1.12, rate: 1.25, emoji: '⚡', description: '30 saniyelik hızlı özet akışı' },
 { id: 'local:tiktok_viral_tr', provider: 'local-dsp', voice: 'tiktok_viral_tr', model: 'web-speech-dsp', label: 'TikTok Viral • Enerjik Akış', category: 'Türkçe Karakter DSP', language: 'Türkçe (tr-TR)', gender: 'male', pitch: 1.06, rate: 1.22, emoji: '🎬', description: 'Sürekli TikTok akışı için hızlı vurgu' },
 { id: 'voicestudio:the_tiktok_mc', provider: 'voicestudio', voice: 'the_tiktok_mc', model: 'omnivoice', label: 'VoiceStudio • TikTok MC', category: 'VoiceStudio Yerel', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 1.12, rate: 1.18, emoji: '🔥', description: 'TikTok kısa bilgi akışları için enerjik sunucu', instruct: 'male, young adult, energetic, fast pace' }
];

const DEFAULT_PREFS = {
 version: 1,
 selectedVoiceId: 'voicestudio:the_teacher',
 rate: 1.0,
 characterCast: {
  coach: 'voicestudio:the_teacher',
  kayseri: 'voicestudio:captain_crusty',
  roach: 'voicestudio:junior_quacks',
  ada: 'speechify:harper_32',
  can: 'openai:echo',
  narrator: 'speechify:geffen_32'
 },
 updatedAt: null
};

export class VoiceStudioManager {
 constructor(dataDir, opts = {}) {
  this.dataDir = dataDir;
  this.brainDir = resolve(dataDir, 'ai-brain');
  this.prefsFile = resolve(this.brainDir, 'voice-preferences.json');
  const explicitUrl = typeof opts === 'string' ? opts : (opts?.baseUrl || process.env.VOICESTUDIO_BASE_URL || '');
  const p = Number((typeof opts === 'object' && opts?.port) || process.env.VOICESTUDIO_PORT || 3900);
  this.localPort = Number.isInteger(p) && p > 0 && p < 65536 ? p : 3900;
  this.localBase = (explicitUrl || `http://127.0.0.1:${this.localPort}`).replace(/\/$/, '');
 }

 async _atomicWrite(filePath, obj) {
  await mkdir(this.brainDir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await rename(tmp, filePath);
 }

 async loadPreferences() {
  try {
   const parsed = JSON.parse(await readFile(this.prefsFile, 'utf8'));
   if (parsed && typeof parsed === 'object') {
    return {
     ...DEFAULT_PREFS,
     ...parsed,
     characterCast: { ...DEFAULT_PREFS.characterCast, ...(parsed.characterCast || {}) }
    };
   }
  } catch (e) {
   if (e.code !== 'ENOENT') throw e;
  }
  return { ...DEFAULT_PREFS, characterCast: { ...DEFAULT_PREFS.characterCast } };
 }

 async savePreferences(patch = {}) {
  const cur = await this.loadPreferences();
  const next = {
   ...cur,
   ...(typeof patch.selectedVoiceId === 'string' && patch.selectedVoiceId.trim() ? { selectedVoiceId: patch.selectedVoiceId.trim() } : {}),
   ...(Number.isFinite(patch.rate) ? { rate: Math.min(1.5, Math.max(0.6, Number(patch.rate))) } : {}),
   characterCast: {
    ...cur.characterCast,
    ...(patch.characterCast && typeof patch.characterCast === 'object' ? patch.characterCast : {})
   },
   updatedAt: new Date().toISOString()
  };
  await this._atomicWrite(this.prefsFile, next);
  return next;
 }

 async checkLocalVoiceStudio() {
  let healthy = false;
  let localVoices = [];
  let models = [];
  let archetypesCount = 0;

  try {
   const h = await fetch(`${this.localBase}/health`, { signal: AbortSignal.timeout(450) });
   healthy = h.ok;
  } catch {}

  if (healthy) {
   await Promise.all([
    fetch(`${this.localBase}/v1/audio/voices`, { signal: AbortSignal.timeout(550) })
     .then(r => r.ok ? r.json() : null)
     .then(d => { if (Array.isArray(d?.voices)) localVoices = d.voices; })
     .catch(() => {}),
    fetch(`${this.localBase}/models`, { signal: AbortSignal.timeout(550) })
     .then(r => r.ok ? r.json() : null)
     .then(d => { if (Array.isArray(d?.models)) models = d.models; })
     .catch(() => {}),
    fetch(`${this.localBase}/archetypes?limit=150`, { signal: AbortSignal.timeout(550) })
     .then(r => r.ok ? r.json() : null)
     .then(d => {
      if (Array.isArray(d?.items)) {
       archetypesCount = d.total || d.items.length;
       for (const a of d.items) {
        if (a?.id && !localVoices.some(v => v.voice_id === a.id)) {
         localVoices.push({
          voice_id: a.id,
          name: a.name || a.id,
          type: 'voice_design',
          language: a.language || 'English',
          description: a.instruct || '',
          instruct: a.instruct || '',
          preview_url: a.preview_url || ''
         });
        }
       }
      }
     })
     .catch(() => {})
   ]);
  }

  return {
   localAvailable: healthy,
   port: this.localPort,
   localVoices,
   models,
   archetypesCount
  };
 }

 async getSummary() {
  const [prefs, localStatus] = await Promise.all([
   this.loadPreferences(),
   this.checkLocalVoiceStudio()
  ]);
  const seenIds = new Set(FREE_VOICESTUDIO_CATALOG.map(v => v.voice));
  const extraCount = (localStatus.localVoices || []).filter(v => v?.voice_id && !seenIds.has(v.voice_id)).length;
  return {
   zeroApiRequired: true,
   totalFreeVoices: FREE_VOICESTUDIO_CATALOG.length + extraCount,
   localAvailable: localStatus.localAvailable,
   localPort: localStatus.port,
   localVoicesCount: localStatus.localVoices.length,
   selectedVoiceId: prefs.selectedVoiceId,
   rate: prefs.rate,
   characterCast: prefs.characterCast
  };
 }

 async getCatalog() {
  const [prefs, localStatus] = await Promise.all([
   this.loadPreferences(),
   this.checkLocalVoiceStudio()
  ]);

  const seenIds = new Set(FREE_VOICESTUDIO_CATALOG.map(v => v.voice));
  const dynamicVoices = (localStatus.localVoices || [])
   .filter(v => v?.voice_id && !seenIds.has(v.voice_id))
   .map(v => ({
    id: `voicestudio:${v.voice_id}`,
    provider: 'voicestudio',
    voice: v.voice_id,
    model: 'omnivoice',
    label: `VoiceStudio • ${v.name || v.voice_id}`,
    category: 'VoiceStudio Yerel',
    language: v.language || 'Çok Dilli',
    gender: 'neutral',
    pitch: 1.0,
    rate: 1.0,
    emoji: v.type === 'profile' ? '🎤' : '🎭',
    description: v.description || v.instruct || 'Bilgisayarındaki yerel VoiceStudio sesi',
    instruct: v.instruct || '',
    previewUrl: v.preview_url || `/voicestudio/profiles/${encodeURIComponent(v.voice_id)}/audio`
   }));

  const voices = [...FREE_VOICESTUDIO_CATALOG, ...dynamicVoices];
  return {
   ok: true,
   zeroApiRequired: true,
   totalFreeVoices: voices.length,
   localAvailable: localStatus.localAvailable,
   localPort: localStatus.port,
   localVoicesCount: localStatus.localVoices.length,
   models: localStatus.models,
   preferences: prefs,
   voices
  };
 }

 async synthesizeViaLocalServer({ text, voice = 'demo0001', speed = 1.0, language = 'tr', instruct = '' }) {
  const clean = String(text || '').trim();
  if (!clean) return { ok: false, reason: 'Metin boş.' };
  try {
   const r = await fetch(`${this.localBase}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     model: process.env.VOICESTUDIO_MODEL || 'omnivoice',
     voice,
     input: clean,
     response_format: 'mp3',
     speed: Math.min(2.0, Math.max(0.5, Number(speed || 1))),
     language,
     ...(instruct ? { instruct } : {})
    }),
    signal: AbortSignal.timeout(20_000)
   });
   if (!r.ok) return { ok: false, localAvailable: false, status: r.status };
   const buf = Buffer.from(await r.arrayBuffer());
   return {
    ok: true,
    localAvailable: true,
    contentType: r.headers.get('content-type') || 'audio/mpeg',
    buffer: buf
   };
  } catch {
   return { ok: false, localAvailable: false };
  }
 }
}
