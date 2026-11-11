import {
 listLocalVoiceStudioVoices,
 speakWithLocalVoiceStudio,
 stopLocalVoiceStudio,
 voiceStudioIsAvailable
} from './voiceStudioLocal';

export type VoiceProvider = 'voicestudio' | 'speechify' | 'openai' | 'elevenlabs' | 'webspeech';
export type CharacterRole = 'coach' | 'kayseri' | 'roach' | 'ada' | 'can' | 'narrator';

export interface VoiceProfile {
 id: string;
 provider: VoiceProvider;
 voice: string;
 model?: string;
 label: string;
 category: string;
 language: string;
 gender?: 'male' | 'female' | 'neutral';
 pitch?: number;
 rate?: number;
 emoji: string;
 description: string;
 instruct?: string;
 previewUrl?: string;
}

export interface CharacterRoleInfo {
 role: CharacterRole;
 label: string;
 emoji: string;
 defaultVoiceId: string;
 hint: string;
}

export const CHARACTER_ROLES: CharacterRoleInfo[] = [
 { role: 'coach', label: 'Koç Yapay Zekâ', emoji: '🏋️', defaultVoiceId: 'voicestudio:the_teacher', hint: 'Bilge, net ve motive edici öğretmen tonu' },
 { role: 'kayseri', label: 'Kayserili Koç Emmi', emoji: '🌶️', defaultVoiceId: 'voicestudio:captain_crusty', hint: 'Tok, sert-komik Kayseri şiveli vuruş tonu' },
 { role: 'roach', label: 'Hamam Böceği Böcü', emoji: '🪳', defaultVoiceId: 'voicestudio:junior_quacks', hint: 'Hızlı, cırlak ve komik çizgi film sesi' },
 { role: 'ada', label: 'Sporcu Ada', emoji: '🏃‍♀️', defaultVoiceId: 'speechify:harper_32', hint: 'Enerjik, meraklı ve dinamik öğrenci sesi' },
 { role: 'can', label: 'Tuzakçı Can', emoji: '🎭', defaultVoiceId: 'openai:echo', hint: 'Şakacı, soru soran ve şaşırtıcı karakter' },
 { role: 'narrator', label: 'Ders Anlatıcısı', emoji: '📖', defaultVoiceId: 'speechify:geffen_32', hint: 'Uzun ünite okumaları için sakin sesli kitap tonu' }
];

const DEFAULT_CAST: Record<CharacterRole, string> = {
 coach: 'voicestudio:the_teacher',
 kayseri: 'voicestudio:captain_crusty',
 roach: 'voicestudio:junior_quacks',
 ada: 'speechify:harper_32',
 can: 'openai:echo',
 narrator: 'speechify:geffen_32'
};

export const FALLBACK_FREE_VOICES: VoiceProfile[] = [
 // VoiceStudio Yerel & OmniVoice Tasarım Profilleri (0-API)
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

 // Speechify Free Multilingual Voices (Puter — 0-API, DilKoç referans sesleri)
 { id: 'speechify:geffen_32', provider: 'speechify', voice: 'geffen_32', model: 'simba-multilingual', label: 'Geffen • Sıcak & Dengeli', category: 'Speechify Free', language: 'Türkçe Çok Dilli', gender: 'male', pitch: 0.98, rate: 1.0, emoji: '🌿', description: 'Ders anlatımları için sıcak, yormayan ses' },
 { id: 'speechify:dominic_32', provider: 'speechify', voice: 'dominic_32', model: 'simba-multilingual', label: 'Dominic • Net & Enerjik Koç', category: 'Speechify Free', language: 'Türkçe Çok Dilli', gender: 'male', pitch: 1.02, rate: 1.08, emoji: '⚡', description: 'Hızlı, net ve enerjik antrenör sesi' },
 { id: 'speechify:harper_32', provider: 'speechify', voice: 'harper_32', model: 'simba-multilingual', label: 'Harper • Yumuşak Anlatım', category: 'Speechify Free', language: 'Türkçe Çok Dilli', gender: 'female', pitch: 1.06, rate: 0.96, emoji: '🌙', description: 'Uzun açıklamalar ve tekrarlar için yumuşak ton' },
 { id: 'speechify:hugh_32', provider: 'speechify', voice: 'hugh_32', model: 'simba-multilingual', label: 'Hugh • Tok Radyo Spikeri', category: 'Speechify Free', language: 'Türkçe Çok Dilli', gender: 'male', pitch: 0.88, rate: 1.0, emoji: '🎙️', description: 'Tok, radyo spikeri tarzı güvenilir AI sesi' },
 { id: 'speechify:emily_32', provider: 'speechify', voice: 'emily_32', model: 'simba-multilingual', label: 'Emily • Akıcı Kadın', category: 'Speechify Free', language: 'Türkçe Çok Dilli', gender: 'female', pitch: 1.1, rate: 1.02, emoji: '☀️', description: 'Canlı ve akıcı Türkçe okuma' },
 { id: 'speechify:henry_32', provider: 'speechify', voice: 'henry_32', model: 'simba-multilingual', label: 'Henry • Akademik Hoca', category: 'Speechify Free', language: 'Türkçe Çok Dilli', gender: 'male', pitch: 0.92, rate: 0.95, emoji: '🏛️', description: 'Konu özeti ve tanımlar için oturaklı ton' },
 { id: 'speechify:erin_32', provider: 'speechify', voice: 'erin_32', model: 'simba-multilingual', label: 'Erin • Dinamik Anlatıcı', category: 'Speechify Free', language: 'Türkçe Çok Dilli', gender: 'female', pitch: 1.12, rate: 1.06, emoji: '🌟', description: 'Kısa terim kartları için vurgulu kadın sesi' },
 { id: 'speechify:lauren_32', provider: 'speechify', voice: 'lauren_32', model: 'simba-multilingual', label: 'Lauren • Doğal Öğretmen', category: 'Speechify Free', language: 'Türkçe Çok Dilli', gender: 'female', pitch: 1.04, rate: 0.98, emoji: '📖', description: 'Doğal vurgulu ders rehberi' },

 // OpenAI gpt-4o-mini-tts Free Voices (Puter — 0-API)
 { id: 'openai:alloy', provider: 'openai', voice: 'alloy', model: 'gpt-4o-mini-tts', label: 'OpenAI • Alloy (Dengeli)', category: 'OpenAI Free', language: 'Türkçe / Çok Dilli', gender: 'neutral', pitch: 1.0, rate: 1.0, emoji: '💠', description: 'Her ders içeriğine uyan nötr ve net ses' },
 { id: 'openai:ash', provider: 'openai', voice: 'ash', model: 'gpt-4o-mini-tts', label: 'OpenAI • Ash (Derin & Net)', category: 'OpenAI Free', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 0.9, rate: 0.98, emoji: '🪨', description: 'Sınav stratejileri için güven veren ton' },
 { id: 'openai:ballad', provider: 'openai', voice: 'ballad', model: 'gpt-4o-mini-tts', label: 'OpenAI • Ballad (Yumuşak)', category: 'OpenAI Free', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 0.96, rate: 0.95, emoji: '🎼', description: 'Akıcı konu anlatımı ve hikâyeleme' },
 { id: 'openai:coral', provider: 'openai', voice: 'coral', model: 'gpt-4o-mini-tts', label: 'OpenAI • Coral (Canlı Kadın)', category: 'OpenAI Free', language: 'Türkçe / Çok Dilli', gender: 'female', pitch: 1.06, rate: 1.02, emoji: '🪸', description: 'Doğal, sıcak ve yüksek anlaşılırlık' },
 { id: 'openai:echo', provider: 'openai', voice: 'echo', model: 'gpt-4o-mini-tts', label: 'OpenAI • Echo (Dinamik Erkek)', category: 'OpenAI Free', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 0.94, rate: 1.02, emoji: '🔊', description: 'Net konsonant vurgulu erkek sesi' },
 { id: 'openai:fable', provider: 'openai', voice: 'fable', model: 'gpt-4o-mini-tts', label: 'OpenAI • Fable (Masalsı)', category: 'OpenAI Free', language: 'Türkçe / Çok Dilli', gender: 'neutral', pitch: 1.04, rate: 0.98, emoji: '🧚', description: 'Kodlama ve akrostiş hikâyeleri için harika' },
 { id: 'openai:nova', provider: 'openai', voice: 'nova', model: 'gpt-4o-mini-tts', label: 'OpenAI • Nova (Enerjik)', category: 'OpenAI Free', language: 'Türkçe / Çok Dilli', gender: 'female', pitch: 1.08, rate: 1.04, emoji: '🌠', description: 'Genç ve enerjik eğitim sunumu' },
 { id: 'openai:onyx', provider: 'openai', voice: 'onyx', model: 'gpt-4o-mini-tts', label: 'OpenAI • Onyx (Kalın Bas)', category: 'OpenAI Free', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 0.82, rate: 0.95, emoji: '🖤', description: 'Kalın, ciddi ve belgesel düzeyinde bas ton' },
 { id: 'openai:sage', provider: 'openai', voice: 'sage', model: 'gpt-4o-mini-tts', label: 'OpenAI • Sage (Bilge)', category: 'OpenAI Free', language: 'Türkçe / Çok Dilli', gender: 'female', pitch: 0.96, rate: 0.96, emoji: '🌿', description: 'Sakin, ölçülü ve dikkat toplayan ses' },
 { id: 'openai:shimmer', provider: 'openai', voice: 'shimmer', model: 'gpt-4o-mini-tts', label: 'OpenAI • Shimmer (Parlak)', category: 'OpenAI Free', language: 'Türkçe / Çok Dilli', gender: 'female', pitch: 1.12, rate: 1.02, emoji: '💎', description: 'Yüksek frekanslı berrak seslendirme' },
 { id: 'openai:verse', provider: 'openai', voice: 'verse', model: 'gpt-4o-mini-tts', label: 'OpenAI • Verse (Etkileyici)', category: 'OpenAI Free', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 0.98, rate: 1.04, emoji: '🎤', description: 'Vurgulu diyalog ve tiyatro sahneleri' },

 // ElevenLabs Free Multilingual v2 (Puter — 0-API)
 { id: 'elevenlabs:rachel', provider: 'elevenlabs', voice: '21m00Tcm4TlvDq8ikWAM', model: 'eleven_multilingual_v2', label: 'ElevenLabs • Rachel (Sakin)', category: 'ElevenLabs Free', language: 'Türkçe / Çok Dilli', gender: 'female', pitch: 1.0, rate: 0.98, emoji: '🎙️', description: 'Çok dilli berrak ve doğal ElevenLabs sesi' },
 { id: 'elevenlabs:adam', provider: 'elevenlabs', voice: 'pNInz6obpgDQGcFmaJgB', model: 'eleven_multilingual_v2', label: 'ElevenLabs • Adam (Tok Anlatım)', category: 'ElevenLabs Free', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 0.86, rate: 0.97, emoji: '🦁', description: 'Güçlü belgesel ve ders anlatımı' },
 { id: 'elevenlabs:bella', provider: 'elevenlabs', voice: 'EXAVITQu4vr4xnSDxMaL', model: 'eleven_multilingual_v2', label: 'ElevenLabs • Bella (Yumuşak)', category: 'ElevenLabs Free', language: 'Türkçe / Çok Dilli', gender: 'female', pitch: 1.06, rate: 0.98, emoji: '🌸', description: 'Sıcak ve yumuşak kadın sesi' },
 { id: 'elevenlabs:antoni', provider: 'elevenlabs', voice: 'ErXwobaYiN019PkySvjV', model: 'eleven_multilingual_v2', label: 'ElevenLabs • Antoni (Akıcı)', category: 'ElevenLabs Free', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 0.96, rate: 1.02, emoji: '🎬', description: 'Dengeli ve profesyonel sunum sesi' },
 { id: 'elevenlabs:josh', provider: 'elevenlabs', voice: 'TxGEqnHWrfWFTfGW9XjX', model: 'eleven_multilingual_v2', label: 'ElevenLabs • Josh (Derin)', category: 'ElevenLabs Free', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 0.88, rate: 0.98, emoji: '🎙️', description: 'Derin rezonanslı anlatıcı sesi' },
 { id: 'elevenlabs:elli', provider: 'elevenlabs', voice: 'MF3mGyEYCl7XYWbV9V6O', model: 'eleven_multilingual_v2', label: 'ElevenLabs • Elli (Genç)', category: 'ElevenLabs Free', language: 'Türkçe / Çok Dilli', gender: 'female', pitch: 1.15, rate: 1.05, emoji: '🎒', description: 'Genç ve enerjik öğrenci karakteri' },
 { id: 'elevenlabs:sam', provider: 'elevenlabs', voice: 'yoZ06aMxZJJ28mfd3POQ', model: 'eleven_multilingual_v2', label: 'ElevenLabs • Sam (Dinamik)', category: 'ElevenLabs Free', language: 'Türkçe / Çok Dilli', gender: 'male', pitch: 1.0, rate: 1.04, emoji: '⚡', description: 'Canlı soru-cevap anlatıcısı' },

 // Çevrimdışı Anında Türkçe Karakter DSP Profilleri (Browser Web Speech — %100 Offline & 0-API)
 { id: 'webspeech:kayseri_emmi', provider: 'webspeech', voice: 'kayseri_emmi', label: 'Türkçe Karakter • Kayserili Koç Emmi', category: 'Türkçe Karakter DSP', language: 'Türkçe (tr-TR)', gender: 'male', pitch: 0.76, rate: 1.06, emoji: '🌶️', description: 'Sert-komik Kayseri vuruşları için derin tok ton' },
 { id: 'webspeech:bocu_karakter', provider: 'webspeech', voice: 'bocu_karakter', label: 'Türkçe Karakter • Hamam Böceği Böcü', category: 'Türkçe Karakter DSP', language: 'Türkçe (tr-TR)', gender: 'male', pitch: 1.48, rate: 1.24, emoji: '🪳', description: 'Hızlı ve çizgi film tadında yüksek perde komedi sesi' },
 { id: 'webspeech:koc_ai', provider: 'webspeech', voice: 'koc_ai', label: 'Türkçe Karakter • Koç Yapay Zekâ', category: 'Türkçe Karakter DSP', language: 'Türkçe (tr-TR)', gender: 'male', pitch: 0.94, rate: 1.0, emoji: '🏋️', description: 'Dengeli, otoriter ve anlaşılır antrenör sesi' },
 { id: 'webspeech:ada_sporcu', provider: 'webspeech', voice: 'ada_sporcu', label: 'Türkçe Karakter • Sporcu Ada', category: 'Türkçe Karakter DSP', language: 'Türkçe (tr-TR)', gender: 'female', pitch: 1.16, rate: 1.05, emoji: '🏃‍♀️', description: 'Canlı, genç ve meraklı sporcu sesi' },
 { id: 'webspeech:can_sakaci', provider: 'webspeech', voice: 'can_sakaci', label: 'Türkçe Karakter • Şakacı Can', category: 'Türkçe Karakter DSP', language: 'Türkçe (tr-TR)', gender: 'male', pitch: 1.08, rate: 1.08, emoji: '🎭', description: 'Tuzakları deneyen enerjik ses' },
 { id: 'webspeech:stadyum_spiker', provider: 'webspeech', voice: 'stadyum_spiker', label: 'Türkçe Karakter • 90. Dakika Spikeri', category: 'Türkçe Karakter DSP', language: 'Türkçe (tr-TR)', gender: 'male', pitch: 1.02, rate: 1.2, emoji: '🏟️', description: 'Maç anlatımı coşkusunda hızlı ses' },
 { id: 'webspeech:prof_bilge', provider: 'webspeech', voice: 'prof_bilge', label: 'Türkçe Karakter • Prof. Bilge (Yavaş)', category: 'Türkçe Karakter DSP', language: 'Türkçe (tr-TR)', gender: 'female', pitch: 0.88, rate: 0.88, emoji: '🔬', description: 'Zor terimleri tane tane okuyan yavaş akademik ton' },
 { id: 'webspeech:fisi_sifre', provider: 'webspeech', voice: 'fisi_sifre', label: 'Türkçe Karakter • Sınav Şifrecisi', category: 'Türkçe Karakter DSP', language: 'Türkçe (tr-TR)', gender: 'female', pitch: 0.98, rate: 0.92, emoji: '🔑', description: 'Akrostiş ve şifre cümlelerini zihne işleyen ton' }
];

const LS_VOICE_ID = 'tempo_voicestudio_voice_id_v1';
const LS_VOICE_RATE = 'tempo_voicestudio_rate_v1';
const LS_CHARACTER_CAST = 'tempo_voicestudio_cast_v1';

let catalogVoices: VoiceProfile[] = [...FALLBACK_FREE_VOICES];
let localAvailable = false;
let localProfileIds = new Set<string>();
let activePlaybackToken = 0;
let activeCloudAudio: HTMLAudioElement | null = null;
let puterUnavailableUntil = 0;
let puterLoadPromise: Promise<any> | null = null;

function cleanTextForSpeech(text: string): string {
 return String(text || '')
  .replace(/[\u{1F300}-\u{1FAFF}]/gu, ' ')
  .replace(/\*\*/g, '')
  .replace(/\s+/g, ' ')
  .trim();
}

export function splitSpeechChunks(text: string, maxChars = 240): string[] {
 const clean = cleanTextForSpeech(text);
 if (!clean) return [];
 const sentences = clean.split(/(?<=[.!?;:])\s+/).filter(Boolean);
 const out: string[] = [];
 let cur = '';
 for (const s of sentences) {
  if (s.length > maxChars) {
   if (cur) {
    out.push(cur);
    cur = '';
   }
   const words = s.split(/\s+/);
   let part = '';
   for (const w of words) {
    if ((part + ' ' + w).trim().length > maxChars && part) {
     out.push(part);
     part = w;
    } else {
     part = (part + ' ' + w).trim();
    }
   }
   if (part) out.push(part);
  } else if ((cur + ' ' + s).trim().length > maxChars && cur) {
   out.push(cur);
   cur = s;
  } else {
   cur = (cur + ' ' + s).trim();
  }
 }
 if (cur) out.push(cur);
 return out;
}

export function getSelectedVoiceId(): string {
 try {
  return localStorage.getItem(LS_VOICE_ID) || 'voicestudio:the_teacher';
 } catch {
  return 'voicestudio:the_teacher';
 }
}

export function setSelectedVoiceId(id: string): void {
 try {
  localStorage.setItem(LS_VOICE_ID, id);
 } catch {}
 fetch('/api/ollama/voicestudio/preferences', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ selectedVoiceId: id })
 }).catch(() => {});
}

export function getVoiceRate(): number {
 try {
  const n = Number(localStorage.getItem(LS_VOICE_RATE) || '1');
  return Number.isFinite(n) ? Math.min(1.6, Math.max(0.6, n)) : 1;
 } catch {
  return 1;
 }
}

export function setVoiceRate(rate: number): void {
 const clamped = Math.min(1.6, Math.max(0.6, Number(rate || 1)));
 try {
  localStorage.setItem(LS_VOICE_RATE, String(clamped));
 } catch {}
 fetch('/api/ollama/voicestudio/preferences', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rate: clamped })
 }).catch(() => {});
}

export function getCharacterCast(): Record<CharacterRole, string> {
 try {
  const raw = localStorage.getItem(LS_CHARACTER_CAST);
  if (raw) {
   const parsed = JSON.parse(raw);
   return { ...DEFAULT_CAST, ...parsed };
  }
 } catch {}
 return { ...DEFAULT_CAST };
}

export function setCharacterVoice(role: CharacterRole, voiceId: string): Record<CharacterRole, string> {
 const next = { ...getCharacterCast(), [role]: voiceId };
 try {
  localStorage.setItem(LS_CHARACTER_CAST, JSON.stringify(next));
 } catch {}
 fetch('/api/ollama/voicestudio/preferences', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ characterCast: next })
 }).catch(() => {});
 return next;
}

export function resetCharacterCast(): Record<CharacterRole, string> {
 const next = { ...DEFAULT_CAST };
 try {
  localStorage.setItem(LS_CHARACTER_CAST, JSON.stringify(next));
 } catch {}
 fetch('/api/ollama/voicestudio/preferences', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ characterCast: next })
 }).catch(() => {});
 return next;
}

export function listBrowserSpeechVoices(): VoiceProfile[] {
 if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
 const sys = window.speechSynthesis.getVoices() || [];
 const tr = sys.filter(v => (v.lang || '').toLowerCase().startsWith('tr'));
 const others = sys.filter(v => !(v.lang || '').toLowerCase().startsWith('tr')).slice(0, 12);
 return [...tr, ...others].map((v, idx) => ({
  id: `browser:${v.name}`,
  provider: 'webspeech' as VoiceProvider,
  voice: v.name,
  label: `Tarayıcı • ${v.name}`,
  category: 'Tarayıcı Sesleri',
  language: v.lang || 'tr-TR',
  gender: /female|yelda|emel|zira|hazel|samantha|victoria|karen|susan|aria|jenny/i.test(v.name)
   ? 'female'
   : (/male|tolga|ahmet|david|mark|daniel|alex|fred/i.test(v.name) ? 'male' : 'neutral'),
  pitch: 1.0,
  rate: 1.0,
  emoji: (v.lang || '').toLowerCase().startsWith('tr') ? '🇹🇷' : `🗣️`,
  description: `Sistem tarayıcı sesi (${v.lang || 'yerel'}) #${idx + 1}`
 }));
}

export function getAllAvailableVoices(): VoiceProfile[] {
 const browserVoices = listBrowserSpeechVoices();
 const seen = new Set(catalogVoices.map(v => v.id));
 return [...catalogVoices, ...browserVoices.filter(v => !seen.has(v.id))];
}

export function isVoiceStudioLocalReady(): boolean {
 return localAvailable;
}

export async function fetchVoiceStudioCatalog(forceLocalCheck = false): Promise<{
 voices: VoiceProfile[];
 localAvailable: boolean;
 totalFreeVoices: number;
}> {
 try {
  const [serverRes, localOk, localVoices] = await Promise.all([
   fetch('/api/ollama/voicestudio/catalog', { signal: AbortSignal.timeout(3000) })
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null),
   voiceStudioIsAvailable(forceLocalCheck).catch(() => false),
   listLocalVoiceStudioVoices().catch(() => [])
  ]);

  localAvailable = Boolean(localOk || serverRes?.localAvailable);
  localProfileIds = new Set(localVoices.filter(v => v.type === 'profile').map(v => v.id));

  const merged: VoiceProfile[] = Array.isArray(serverRes?.voices) && serverRes.voices.length
   ? [...serverRes.voices]
   : [...FALLBACK_FREE_VOICES];
  const seen = new Set(merged.map(v => v.id));

  for (const lv of localVoices) {
   const id = `voicestudio:${lv.id}`;
   if (seen.has(id)) continue;
   seen.add(id);
   merged.push({
    id,
    provider: 'voicestudio',
    voice: lv.id,
    model: 'omnivoice',
    label: `VoiceStudio • ${lv.name}`,
    category: 'VoiceStudio Yerel',
    language: lv.language || 'Çok Dilli',
    gender: 'neutral',
    pitch: 1.0,
    rate: 1.0,
    emoji: lv.type === 'profile' ? '🎤' : '🎭',
    description: lv.description || 'Bilgisayarındaki yerel VoiceStudio sesi',
    instruct: lv.instruct,
    previewUrl: lv.previewUrl
   });
  }

  catalogVoices = merged;
  const all = getAllAvailableVoices();
  return {
   voices: all,
   localAvailable,
   totalFreeVoices: all.length
  };
 } catch {
  const all = getAllAvailableVoices();
  return {
   voices: all,
   localAvailable,
   totalFreeVoices: all.length
  };
 }
}

export function getVoiceProfile(voiceIdOrRole?: string): VoiceProfile {
 const all = getAllAvailableVoices();
 if (voiceIdOrRole && (voiceIdOrRole in DEFAULT_CAST)) {
  const cast = getCharacterCast();
  const mappedId = cast[voiceIdOrRole as CharacterRole];
  const foundCast = all.find(v => v.id === mappedId);
  if (foundCast) return foundCast;
 }
 if (voiceIdOrRole) {
  const found = all.find(v => v.id === voiceIdOrRole || v.voice === voiceIdOrRole);
  if (found) return found;
 }
 const selectedId = getSelectedVoiceId();
 return all.find(v => v.id === selectedId) || all[0] || FALLBACK_FREE_VOICES[0];
}

async function loadPuter(): Promise<any | null> {
 if (Date.now() < puterUnavailableUntil) return null;
 const w = window as unknown as { puter?: any };
 if (w.puter?.ai?.txt2speech) return w.puter;
 if (!puterLoadPromise) {
  puterLoadPromise = new Promise(resolve => {
   const existing = document.querySelector('script[data-puter-tts="1"]') as HTMLScriptElement | null;
   const timeoutId = setTimeout(() => {
    puterUnavailableUntil = Date.now() + 60_000;
    resolve(null);
   }, 3500);
   if (existing) {
    existing.addEventListener('load', () => {
     clearTimeout(timeoutId);
     resolve((window as any).puter || null);
    });
    existing.addEventListener('error', () => {
     clearTimeout(timeoutId);
     puterUnavailableUntil = Date.now() + 60_000;
     resolve(null);
    });
    return;
   }
   const s = document.createElement('script');
   s.src = 'https://js.puter.com/v2/';
   s.async = true;
   s.dataset.puterTts = '1';
   s.onload = () => {
    clearTimeout(timeoutId);
    resolve((window as any).puter || null);
   };
   s.onerror = () => {
    clearTimeout(timeoutId);
    puterUnavailableUntil = Date.now() + 60_000;
    resolve(null);
   };
   document.head.appendChild(s);
  });
 }
 return puterLoadPromise;
}

async function speakViaPuter(text: string, profile: VoiceProfile, rate: number, token: number, onStart?: () => void): Promise<boolean> {
 if (Date.now() < puterUnavailableUntil) return false;
 try {
  const puter = await loadPuter();
  if (!puter?.ai?.txt2speech || token !== activePlaybackToken) return false;
  const opts: Record<string, unknown> = {
   provider: profile.provider === 'voicestudio' ? 'speechify' : profile.provider,
   voice: profile.provider === 'voicestudio' ? 'geffen_32' : profile.voice,
   language: 'tr-TR'
  };
  if (profile.model && profile.provider !== 'voicestudio') {
   opts.model = profile.model;
  }
  const audio: HTMLAudioElement = await puter.ai.txt2speech(text, opts);
  if (!audio || token !== activePlaybackToken) return false;
  activeCloudAudio = audio;
  audio.playbackRate = Math.min(1.6, Math.max(0.65, rate * (profile.rate ?? 1)));
  await new Promise<void>((resolve, reject) => {
   let started = false;
   audio.onplay = () => {
    started = true;
    onStart?.();
   };
   audio.onended = () => resolve();
   audio.onerror = () => reject(new Error('Puter ses oynatılamadı.'));
   audio.play().catch(err => {
    if (!started) reject(err);
   });
  });
  return true;
 } catch {
  puterUnavailableUntil = Date.now() + 60_000;
  return false;
 } finally {
  activeCloudAudio = null;
 }
}

function pickBestSystemVoice(profile: VoiceProfile): SpeechSynthesisVoice | null {
 if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
 const voices = window.speechSynthesis.getVoices() || [];
 if (!voices.length) return null;

 // Exact browser voice match
 if (profile.id.startsWith('browser:')) {
  const exact = voices.find(v => v.name === profile.voice);
  if (exact) return exact;
 }

 const trVoices = voices.filter(v => (v.lang || '').toLowerCase().startsWith('tr'));
 const pool = trVoices.length ? trVoices : voices;
 if (profile.gender === 'female') {
  const fem = pool.find(v => /yelda|emel|female|woman|girl|zira|hazel|samantha|aria|jenny/i.test(v.name));
  if (fem) return fem;
 }
 if (profile.gender === 'male') {
  const mal = pool.find(v => /tolga|ahmet|male|man|boy|david|mark|daniel|guy|andrew/i.test(v.name));
  if (mal) return mal;
 }
 // Hash across available voices so distinct profiles pick different system voices when multiple exist
 if (pool.length > 1) {
  let hash = 0;
  for (let i = 0; i < profile.id.length; i++) hash = (hash * 31 + profile.id.charCodeAt(i)) | 0;
  return pool[Math.abs(hash) % pool.length];
 }
 return pool[0] || null;
}

async function speakViaWebSpeech(text: string, profile: VoiceProfile, rate: number, token: number, onStart?: () => void): Promise<boolean> {
 if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
 const synth = window.speechSynthesis;
 synth.cancel();

 const chunks = splitSpeechChunks(text, 220);
 if (!chunks.length) return false;

 const chosenSysVoice = pickBestSystemVoice(profile);
 const effectiveRate = Math.min(1.8, Math.max(0.55, rate * (profile.rate ?? 1)));
 const effectivePitch = Math.min(1.85, Math.max(0.55, profile.pitch ?? 1));

 let startedAny = false;
 for (const chunk of chunks) {
  if (token !== activePlaybackToken) return false;
  await new Promise<void>(resolve => {
   const u = new SpeechSynthesisUtterance(chunk);
   u.lang = chosenSysVoice?.lang || 'tr-TR';
   if (chosenSysVoice) u.voice = chosenSysVoice;
   u.rate = effectiveRate;
   u.pitch = effectivePitch;
   u.onstart = () => {
    if (!startedAny) {
     startedAny = true;
     onStart?.();
    }
   };
   u.onend = () => resolve();
   u.onerror = () => resolve();
   synth.speak(u);
  });
 }
 return true;
}

export function stopVoiceStudio(): void {
 activePlaybackToken++;
 stopLocalVoiceStudio();
 if (activeCloudAudio) {
  try {
   activeCloudAudio.pause();
   activeCloudAudio.currentTime = 0;
  } catch {}
  activeCloudAudio = null;
 }
 if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try {
   window.speechSynthesis.cancel();
  } catch {}
 }
}

export interface SpeakOptions {
 voiceId?: string;
 role?: CharacterRole | string;
 rate?: number;
 onStart?: (profile: VoiceProfile, engineUsed: string) => void;
 onEnd?: () => void;
}

export async function speakWithVoiceStudio(text: string, opts: SpeakOptions = {}): Promise<{ ok: boolean; profile: VoiceProfile; engine: string }> {
 const clean = cleanTextForSpeech(text);
 const profile = getVoiceProfile(opts.voiceId || opts.role);
 if (!clean) return { ok: false, profile, engine: 'none' };

 stopVoiceStudio();
 const token = activePlaybackToken;
 const rate = opts.rate ?? getVoiceRate();

 // 1) Yerel VoiceStudio (port 3900 / OmniVoice) varsa ve ses VoiceStudio veya karakter ise önce onu dene!
 if (profile.provider === 'voicestudio' && (await voiceStudioIsAvailable())) {
  const ok = await speakWithLocalVoiceStudio(
   clean,
   profile.voice,
   rate * (profile.rate ?? 1),
   () => opts.onStart?.(profile, 'VoiceStudio Yerel (OmniVoice)'),
   profile.instruct,
   'tr',
   localProfileIds
  );
  if (token !== activePlaybackToken) return { ok: false, profile, engine: 'cancelled' };
  if (ok) {
   opts.onEnd?.();
   return { ok: true, profile, engine: 'VoiceStudio Yerel' };
  }
 }

 // 2) Ücretsiz 0-API Bulut Ses Motorları (Speechify / OpenAI / ElevenLabs via Puter JS)
 if (profile.provider === 'speechify' || profile.provider === 'openai' || profile.provider === 'elevenlabs') {
  const ok = await speakViaPuter(
   clean,
   profile,
   rate,
   token,
   () => opts.onStart?.(profile, `${profile.category} (0-API)`)
  );
  if (token !== activePlaybackToken) return { ok: false, profile, engine: 'cancelled' };
  if (ok) {
   opts.onEnd?.();
   return { ok: true, profile, engine: profile.category };
  }
 }

 // 3) Kesintisiz Türkçe Karakter DSP + Tarayıcı Web Speech Yedeği (%100 Çevrimdışı Çalışır)
 const webOk = await speakViaWebSpeech(
  clean,
  profile,
  rate,
  token,
  () => opts.onStart?.(profile, 'Türkçe Karakter DSP (0-API)')
 );
 if (token === activePlaybackToken) {
  opts.onEnd?.();
 }
 return { ok: webOk, profile, engine: 'Türkçe Karakter DSP' };
}

export async function speakDialogueSequence(
 lines: Array<{ speaker: string; text: string }>,
 opts: { rate?: number; onLineStart?: (index: number, profile: VoiceProfile, engine: string) => void; onComplete?: () => void } = {}
): Promise<void> {
 stopVoiceStudio();
 const token = activePlaybackToken;
 const baseRate = opts.rate ?? getVoiceRate();

 for (let i = 0; i < lines.length; i++) {
  if (token !== activePlaybackToken) return;
  const line = lines[i];
  const clean = cleanTextForSpeech(line.text);
  if (!clean) continue;
  const profile = getVoiceProfile(line.speaker);
  let played = false;

  if (profile.provider === 'voicestudio' && (await voiceStudioIsAvailable())) {
   played = await speakWithLocalVoiceStudio(
    clean,
    profile.voice,
    baseRate * (profile.rate ?? 1),
    () => opts.onLineStart?.(i, profile, 'VoiceStudio Yerel'),
    profile.instruct,
    'tr',
    localProfileIds
   );
  }
  if (!played && token === activePlaybackToken && (profile.provider === 'speechify' || profile.provider === 'openai' || profile.provider === 'elevenlabs')) {
   played = await speakViaPuter(
    clean,
    profile,
    baseRate,
    token,
    () => opts.onLineStart?.(i, profile, profile.category)
   );
  }
  if (!played && token === activePlaybackToken) {
   await speakViaWebSpeech(
    clean,
    profile,
    baseRate,
    token,
    () => opts.onLineStart?.(i, profile, 'Türkçe Karakter DSP')
   );
  }
 }
 if (token === activePlaybackToken) {
  opts.onComplete?.();
 }
}
