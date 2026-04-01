/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Search, Loader2, Sun, Moon, Mic, Square, Trash2, Sparkles, Volume1, MessageSquare, GitCompare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Modality } from "@google/genai";
import Markdown from 'react-markdown';
import { surahs } from './data/surahs';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

interface Ayah {
  numberInSurah: number;
  textArabic: string;
  textTransliteration: string;
  textTranslation: string;
}

const TRANSLATIONS = [
  { id: 'en.sahih', name: 'Saheeh International (EN)' },
  { id: 'en.yusufali', name: 'Yusuf Ali (EN)' },
  { id: 'en.maududi', name: 'Maududi (EN)' },
  { id: 'en.shakir', name: 'Shakir (EN)' },
  { id: 'en.hilali', name: 'Hilali & Khan (EN)' },
  { id: 'en.asad', name: 'Muhammad Asad (EN)' },
  { id: 'en.pickthall', name: 'Pickthall (EN)' },
  { id: 'en.itani', name: 'Clear Qur\'an (EN)' },
  { id: 'en.ahmedali', name: 'Ahmed Ali (EN)' },
  { id: 'fr.hamidullah', name: 'Muhammad Hamidullah (FR)' },
  { id: 'fr.rashid', name: 'Rashid Maash (FR)' },
  { id: 'fr.muntakhab', name: 'Le Muntakhab (FR)' },
];

export default function App() {
  const [currentSurah, setCurrentSurah] = useState(surahs[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTranslation, setSelectedTranslation] = useState(TRANSLATIONS[0].id);
  const [selectedReciter, setSelectedReciter] = useState('shur');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [isLoadingAyahs, setIsLoadingAyahs] = useState(false);
  const [availableTranslations, setAvailableTranslations] = useState(TRANSLATIONS);
  const [availableReciters, setAvailableReciters] = useState([{ id: 'shur', name: 'Saud Al-Shuraim' }]);
  
  // Recording states
  const [recordingAyahId, setRecordingAyahId] = useState<number | null>(null);
  const [recordedAudios, setRecordedAudios] = useState<Record<number, string>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // AI states
  const [aiInsights, setAiInsights] = useState<Record<number, string>>({});
  const [isGeneratingAi, setIsGeneratingAi] = useState<Record<number, boolean>>({});
  const [isReadingAi, setIsReadingAi] = useState<Record<number, boolean>>({});
  const [aiFeedback, setAiFeedback] = useState<Record<number, string>>({});
  
  // AI Comparison states
  const [activeCompareAyah, setActiveCompareAyah] = useState<number | null>(null);
  const [aiArabicAudio, setAiArabicAudio] = useState<Record<number, string>>({});
  const [isGeneratingAiArabic, setIsGeneratingAiArabic] = useState<Record<number, boolean>>({});
  const [detailedAnalysis, setDetailedAnalysis] = useState<Record<number, string>>({});
  const [isAnalyzing, setIsAnalyzing] = useState<Record<number, boolean>>({});
  
  // Playback rate states
  const [userPlaybackRate, setUserPlaybackRate] = useState<number>(1);
  const [aiPlaybackRate, setAiPlaybackRate] = useState<number>(1);
  const userAudioRef = useRef<HTMLAudioElement | null>(null);
  const aiAudioRef = useRef<HTMLAudioElement | null>(null);
  
  const audioRef = useRef<HTMLAudioElement>(null);

  const filteredSurahs = surahs.filter(s => 
    s.name_arabic.includes(searchQuery) || 
    s.name_english.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Format ID to 3 digits for the URL (e.g., 1 -> 001)
  const getAudioUrl = (id: number) => {
    // Some APIs use different URL structures. For simplicity, we'll try to adapt.
    // If it's the default shuraim, use the old URL.
    if (selectedReciter === 'shur') {
      const paddedId = id.toString().padStart(3, '0');
      return `https://server7.mp3quran.net/shur/${paddedId}.mp3`;
    }
    // Otherwise use the Al Quran Cloud audio API
    return `https://cdn.islamic.network/quran/audio-surah/128/${selectedReciter}/${id}.mp3`;
  };

  // Fetch Ayahs (Arabic + Transliteration + Translation) when Surah or Translation changes
  useEffect(() => {
    const fetchTranslations = async () => {
      try {
        const [transRes, reciterRes] = await Promise.all([
          fetch('https://api.alquran.cloud/v1/edition?format=text&type=translation'),
          fetch('https://api.alquran.cloud/v1/edition?format=audio&type=surah')
        ]);
        
        const transData = await transRes.json();
        const reciterData = await reciterRes.json();

        if (transData.code === 200) {
          const filtered = transData.data
            .filter((e: any) => e.language === 'en' || e.language === 'fr')
            .map((e: any) => ({
              id: e.identifier,
              name: `${e.name} (${e.language.toUpperCase()})`
            }));
          setAvailableTranslations(filtered.length > 0 ? filtered : TRANSLATIONS);
        }

        if (reciterData.code === 200) {
          const reciters = reciterData.data.map((e: any) => ({
            id: e.identifier,
            name: e.name
          }));
          setAvailableReciters(reciters);
        }
      } catch (e) {
        console.error("Failed to fetch editions list", e);
      }
    };
    fetchTranslations();
  }, []);

  useEffect(() => {
    const fetchAyahs = async () => {
      setIsLoadingAyahs(true);
      try {
        const [arabicRes, transRes, translationRes] = await Promise.all([
          fetch(`https://api.alquran.cloud/v1/surah/${currentSurah.id}`),
          fetch(`https://api.alquran.cloud/v1/surah/${currentSurah.id}/en.transliteration`),
          fetch(`https://api.alquran.cloud/v1/surah/${currentSurah.id}/${selectedTranslation}`)
        ]);
        
        const arabicData = await arabicRes.json();
        const transData = await transRes.json();
        const translationData = await translationRes.json();

        if (arabicData.code === 200 && transData.code === 200 && translationData.code === 200) {
          const combinedAyahs = arabicData.data.ayahs.map((ayah: any, index: number) => ({
            numberInSurah: ayah.numberInSurah,
            textArabic: ayah.text,
            textTransliteration: transData.data.ayahs[index].text,
            textTranslation: translationData.data.ayahs[index].text
          }));
          setAyahs(combinedAyahs);
        }
      } catch (error) {
        console.error("Failed to fetch ayahs", error);
      } finally {
        setIsLoadingAyahs(false);
      }
    };
    
    fetchAyahs();
  }, [currentSurah.id, selectedTranslation]);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(e => console.error("Error playing audio:", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentSurah]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime);
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setProgress(time);
    }
  };

  const togglePlay = () => setIsPlaying(!isPlaying);
  const toggleMute = () => setIsMuted(!isMuted);
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const playSurah = (surah: typeof surahs[0]) => {
    setCurrentSurah(surah);
    setIsPlaying(true);
  };

  const playNext = () => {
    const currentIndex = surahs.findIndex(s => s.id === currentSurah.id);
    if (currentIndex < surahs.length - 1) {
      playSurah(surahs[currentIndex + 1]);
    }
  };

  const playPrevious = () => {
    const currentIndex = surahs.findIndex(s => s.id === currentSurah.id);
    if (currentIndex > 0) {
      playSurah(surahs[currentIndex - 1]);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const startRecording = async (ayahId: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudios(prev => ({ ...prev, [ayahId]: audioUrl }));
        setRecordingAyahId(null);
        
        // Stop all tracks in the stream
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setRecordingAyahId(ayahId);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const deleteRecording = (ayahId: number) => {
    setRecordedAudios(prev => {
      const newAudios = { ...prev };
      if (newAudios[ayahId]) {
        URL.revokeObjectURL(newAudios[ayahId]);
        delete newAudios[ayahId];
      }
      return newAudios;
    });
  };

  const playRecording = (url: string) => {
    if (userAudioRef.current) {
      userAudioRef.current.pause();
    }
    const audio = new Audio(url);
    audio.playbackRate = userPlaybackRate;
    userAudioRef.current = audio;
    audio.play();
  };

  const handleUserSpeedChange = (speed: number) => {
    setUserPlaybackRate(speed);
    if (userAudioRef.current) {
      userAudioRef.current.playbackRate = speed;
    }
  };

  const handleAiSpeedChange = (speed: number) => {
    setAiPlaybackRate(speed);
    if (aiAudioRef.current) {
      aiAudioRef.current.playbackRate = speed;
    }
  };

  const getAiInsights = async (ayah: Ayah) => {
    setIsGeneratingAi(prev => ({ ...prev, [ayah.numberInSurah]: true }));
    try {
      const prompt = `As a Quranic scholar and linguist, provide a brief (2-3 sentences) insight into this verse:
      Arabic: ${ayah.textArabic}
      Transliteration: ${ayah.textTransliteration}
      Translation: ${ayah.textTranslation}
      
      Focus on:
      1. One key linguistic or spiritual depth.
      2. A specific pronunciation tip for the transliteration.
      3. A Tajweed rule applicable to this verse.
      Keep it concise and supportive for a learner.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      
      setAiInsights(prev => ({ ...prev, [ayah.numberInSurah]: response.text || "No insights available." }));
    } catch (error) {
      console.error("AI Insight error:", error);
    } finally {
      setIsGeneratingAi(prev => ({ ...prev, [ayah.numberInSurah]: false }));
    }
  };

  const readWithAi = async (ayah: Ayah) => {
    setIsReadingAi(prev => ({ ...prev, [ayah.numberInSurah]: true }));
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Translation: ${ayah.textTranslation}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioBlob = new Blob([Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0))], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.play();
      }
    } catch (error) {
      console.error("AI Reading error:", error);
    } finally {
      setIsReadingAi(prev => ({ ...prev, [ayah.numberInSurah]: false }));
    }
  };

  const getPronunciationFeedback = async (ayah: Ayah, audioUrl: string) => {
    setIsGeneratingAi(prev => ({ ...prev, [ayah.numberInSurah]: true }));
    try {
      // Fetch the audio blob from the URL
      const audioBlob = await fetch(audioUrl).then(r => r.blob());
      const reader = new FileReader();
      
      const base64Audio = await new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(audioBlob);
      });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { text: `Analyze my pronunciation of this Quranic verse. 
            Target Arabic: ${ayah.textArabic}
            Target Transliteration: ${ayah.textTransliteration}
            Provide 1 specific tip for improvement based on my recording.` },
          { inlineData: { data: base64Audio, mimeType: "audio/wav" } }
        ],
      });

      setAiFeedback(prev => ({ ...prev, [ayah.numberInSurah]: response.text || "Could not analyze audio." }));
    } catch (error) {
      console.error("AI Feedback error:", error);
    } finally {
      setIsGeneratingAi(prev => ({ ...prev, [ayah.numberInSurah]: false }));
    }
  };

  const playAiArabic = async (ayah: Ayah) => {
    if (aiAudioRef.current) {
      aiAudioRef.current.pause();
    }
    if (aiArabicAudio[ayah.numberInSurah]) {
      const audio = new Audio(aiArabicAudio[ayah.numberInSurah]);
      audio.playbackRate = aiPlaybackRate;
      aiAudioRef.current = audio;
      audio.play();
      return;
    }
    setIsGeneratingAiArabic(prev => ({ ...prev, [ayah.numberInSurah]: true }));
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: ayah.textArabic }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Zephyr' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioBlob = new Blob([Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0))], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAiArabicAudio(prev => ({ ...prev, [ayah.numberInSurah]: audioUrl }));
        const audio = new Audio(audioUrl);
        audio.playbackRate = aiPlaybackRate;
        aiAudioRef.current = audio;
        audio.play();
      }
    } catch (error) {
      console.error("AI Arabic TTS error:", error);
    } finally {
      setIsGeneratingAiArabic(prev => ({ ...prev, [ayah.numberInSurah]: false }));
    }
  };

  const getDetailedAnalysis = async (ayah: Ayah, audioUrl: string) => {
    setIsAnalyzing(prev => ({ ...prev, [ayah.numberInSurah]: true }));
    try {
      const audioBlob = await fetch(audioUrl).then(r => r.blob());
      const reader = new FileReader();
      
      const base64Audio = await new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(audioBlob);
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          { text: `Perform a detailed side-by-side comparison of my pronunciation of this Quranic verse against the correct Tajweed rules.
            Target Arabic: ${ayah.textArabic}
            Target Transliteration: ${ayah.textTransliteration}
            
            Please provide:
            1. A score out of 10.
            2. Strengths in my recitation.
            3. Specific areas for improvement (e.g., specific letters, elongation/madd, tajweed rules missed).
            Format as clean, readable Markdown.` },
          { inlineData: { data: base64Audio, mimeType: "audio/wav" } }
        ],
      });

      setDetailedAnalysis(prev => ({ ...prev, [ayah.numberInSurah]: response.text || "Could not analyze." }));
    } catch (error) {
      console.error("Detailed analysis error:", error);
    } finally {
      setIsAnalyzing(prev => ({ ...prev, [ayah.numberInSurah]: false }));
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-500 font-sans selection:bg-emerald-900/50 ${
      theme === 'dark' ? 'bg-[#0a0f0d] text-emerald-50' : 'bg-emerald-50 text-emerald-950'
    }`}>
      {/* Background Atmosphere */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className={`absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full blur-[120px] transition-colors duration-700 ${
          theme === 'dark' ? 'bg-emerald-900/20' : 'bg-emerald-200/40'
        }`} />
        <div className={`absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full blur-[100px] transition-colors duration-700 ${
          theme === 'dark' ? 'bg-teal-900/20' : 'bg-teal-100/30'
        }`} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-6 h-screen flex flex-col">
        {/* Header */}
        <header className="flex flex-col items-center justify-center mb-6 shrink-0 relative">
          <button 
            onClick={toggleTheme}
            className={`absolute right-0 top-0 p-2 rounded-full transition-all ${
              theme === 'dark' ? 'bg-emerald-900/40 text-emerald-400 hover:bg-emerald-800/60' : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
            }`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <h1 className={`text-3xl md:text-4xl font-serif tracking-wide text-center mb-1 transition-colors ${
            theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'
          }`}>
            القرآن الكريم
          </h1>
          <p className={`text-sm md:text-base tracking-widest uppercase font-medium transition-colors ${
            theme === 'dark' ? 'text-emerald-200/60' : 'text-emerald-600/60'
          }`}>
            Learn Pronunciation & Listen
          </p>
        </header>

        {/* Main Content Split */}
        <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden pb-28">
          
          {/* Left Sidebar: Surah List */}
          <div className={`w-full lg:w-1/3 flex flex-col backdrop-blur-md rounded-3xl border overflow-hidden shrink-0 lg:shrink transition-all ${
            theme === 'dark' 
              ? 'bg-emerald-950/40 border-emerald-800/30' 
              : 'bg-white/60 border-emerald-200 shadow-sm'
          }`}>
            {/* Search */}
            <div className={`p-4 border-b transition-colors ${
              theme === 'dark' ? 'border-emerald-800/30' : 'border-emerald-100'
            }`}>
              <div className="relative w-full">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className={`h-5 w-5 transition-colors ${
                    theme === 'dark' ? 'text-emerald-500/50' : 'text-emerald-400'
                  }`} />
                </div>
                <input
                  type="text"
                  placeholder="Search Surah..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full pl-10 pr-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all ${
                    theme === 'dark' 
                      ? 'bg-emerald-900/20 border-emerald-800/30 focus:ring-emerald-500/50 text-emerald-100 placeholder-emerald-500/50' 
                      : 'bg-emerald-50/50 border-emerald-100 focus:ring-emerald-400/50 text-emerald-900 placeholder-emerald-400'
                  }`}
                />
              </div>
            </div>

            {/* List */}
            <div className={`flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar ${theme}`}>
              {filteredSurahs.map((surah) => (
                <button
                  key={surah.id}
                  onClick={() => playSurah(surah)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all border ${
                    currentSurah.id === surah.id 
                      ? theme === 'dark'
                        ? 'bg-emerald-800/40 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
                        : 'bg-emerald-100 border-emerald-300 shadow-sm'
                      : theme === 'dark'
                        ? 'bg-transparent border-transparent hover:bg-emerald-900/20 hover:border-emerald-800/30'
                        : 'bg-transparent border-transparent hover:bg-emerald-50 hover:border-emerald-100'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs transition-colors ${
                      currentSurah.id === surah.id 
                        ? theme === 'dark' ? 'bg-emerald-500 text-emerald-950' : 'bg-emerald-600 text-white'
                        : theme === 'dark' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      {surah.id}
                    </div>
                    <div className="text-left">
                      <h3 className={`font-medium transition-colors ${
                        theme === 'dark' ? 'text-emerald-50' : 'text-emerald-900'
                      }`}>{surah.name_english}</h3>
                    </div>
                  </div>
                  <div className={`text-lg font-serif transition-colors ${
                    theme === 'dark' ? 'text-emerald-300' : 'text-emerald-700'
                  }`}>
                    {surah.name_arabic}
                  </div>
                </button>
              ))}
              {filteredSurahs.length === 0 && (
                <div className={`text-center py-10 transition-colors ${
                  theme === 'dark' ? 'text-emerald-500/50' : 'text-emerald-400'
                }`}>
                  No Surahs found matching "{searchQuery}"
                </div>
              )}
            </div>
          </div>

          {/* Right Main: Ayahs Display */}
          <div className={`w-full lg:w-2/3 flex flex-col backdrop-blur-md rounded-3xl border overflow-hidden relative transition-all ${
            theme === 'dark' 
              ? 'bg-emerald-950/40 border-emerald-800/30' 
              : 'bg-white/60 border-emerald-200 shadow-sm'
          }`}>
            
            {/* Surah Header */}
            <div className={`p-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 transition-colors ${
              theme === 'dark' ? 'border-emerald-800/30 bg-emerald-900/10' : 'border-emerald-100 bg-emerald-50/30'
            }`}>
              <div className="flex items-center gap-4">
                <div>
                  <h2 className={`text-2xl font-bold transition-colors ${
                    theme === 'dark' ? 'text-emerald-50' : 'text-emerald-900'
                  }`}>{currentSurah.name_english}</h2>
                  <p className={`text-sm transition-colors ${
                    theme === 'dark' ? 'text-emerald-400/60' : 'text-emerald-600/60'
                  }`}>Surah {currentSurah.id}</p>
                </div>
                <div className={`h-10 w-[1px] hidden md:block transition-colors ${
                  theme === 'dark' ? 'bg-emerald-800/50' : 'bg-emerald-200'
                }`} />
                <div className="flex flex-col">
                  <label htmlFor="translation-select" className={`text-[10px] uppercase tracking-wider font-bold mb-1 transition-colors ${
                    theme === 'dark' ? 'text-emerald-500/70' : 'text-emerald-600/70'
                  }`}>Translation</label>
                  <select
                    id="translation-select"
                    value={selectedTranslation}
                    onChange={(e) => setSelectedTranslation(e.target.value)}
                    className={`border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 transition-all ${
                      theme === 'dark'
                        ? 'bg-emerald-900/40 border-emerald-800/50 text-emerald-100 focus:ring-emerald-500/50'
                        : 'bg-white border-emerald-200 text-emerald-900 focus:ring-emerald-400/50'
                    }`}
                  >
                    {availableTranslations.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col">
                  <label htmlFor="reciter-select" className={`text-[10px] uppercase tracking-wider font-bold mb-1 transition-colors ${
                    theme === 'dark' ? 'text-emerald-500/70' : 'text-emerald-600/70'
                  }`}>Reciter</label>
                  <select
                    id="reciter-select"
                    value={selectedReciter}
                    onChange={(e) => setSelectedReciter(e.target.value)}
                    className={`border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 transition-all ${
                      theme === 'dark'
                        ? 'bg-emerald-900/40 border-emerald-800/50 text-emerald-100 focus:ring-emerald-500/50'
                        : 'bg-white border-emerald-200 text-emerald-900 focus:ring-emerald-400/50'
                    }`}
                  >
                    {availableReciters.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={`text-3xl font-serif text-right transition-colors ${
                theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'
              }`}>
                {currentSurah.name_arabic}
              </div>
            </div>

            {/* Ayahs List */}
            <div className={`flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar relative ${theme}`}>
              {isLoadingAyahs ? (
                <div className={`absolute inset-0 flex flex-col items-center justify-center transition-colors ${
                  theme === 'dark' ? 'text-emerald-500/50' : 'text-emerald-400'
                }`}>
                  <Loader2 className="w-8 h-8 animate-spin mb-4" />
                  <p>Loading verses...</p>
                </div>
              ) : (
                ayahs.map((ayah) => (
                  <div key={ayah.numberInSurah} className={`flex flex-col space-y-4 p-4 rounded-2xl transition-all border border-transparent ${
                    theme === 'dark' 
                      ? 'hover:bg-emerald-900/20 hover:border-emerald-800/20' 
                      : 'hover:bg-emerald-50 hover:border-emerald-100'
                  }`}>
                    <div className="flex justify-between items-start gap-4 md:gap-6">
                      <div className={`w-8 h-8 shrink-0 rounded-full border flex items-center justify-center text-xs font-mono mt-2 transition-all ${
                        theme === 'dark' 
                          ? 'bg-emerald-900/40 border-emerald-800/50 text-emerald-400' 
                          : 'bg-emerald-100 border-emerald-200 text-emerald-600'
                      }`}>
                        {ayah.numberInSurah}
                      </div>
                      <div className="flex-1 text-right">
                        <p className={`text-2xl md:text-3xl font-serif leading-loose md:leading-loose transition-colors ${
                          theme === 'dark' ? 'text-emerald-50' : 'text-emerald-900'
                        }`} dir="rtl">
                          {ayah.textArabic}
                        </p>
                      </div>
                    </div>
                    <div className="pl-12 md:pl-14 space-y-2">
                      <p className={`text-base md:text-lg leading-relaxed font-medium tracking-wide italic transition-colors ${
                        theme === 'dark' ? 'text-emerald-300/90' : 'text-emerald-700/90'
                      }`}>
                        {ayah.textTransliteration}
                      </p>
                      <p className={`text-sm md:text-base leading-relaxed transition-colors ${
                        theme === 'dark' ? 'text-emerald-100/70' : 'text-emerald-800/70'
                      }`}>
                        {ayah.textTranslation}
                      </p>

                      {/* Recording Controls */}
                      <div className="pt-2 flex flex-wrap items-center gap-3">
                        {recordingAyahId === ayah.numberInSurah ? (
                          <button
                            onClick={stopRecording}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500 text-white text-xs font-bold animate-pulse"
                          >
                            <Square className="w-3 h-3 fill-current" />
                            Stop Recording
                          </button>
                        ) : (
                          <button
                            onClick={() => startRecording(ayah.numberInSurah)}
                            disabled={recordingAyahId !== null}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                              theme === 'dark'
                                ? 'bg-emerald-900/40 text-emerald-400 hover:bg-emerald-800/60'
                                : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            } disabled:opacity-30`}
                          >
                            <Mic className="w-3 h-3" />
                            {recordedAudios[ayah.numberInSurah] ? 'Re-record' : 'Practice'}
                          </button>
                        )}

                        {recordedAudios[ayah.numberInSurah] && recordingAyahId !== ayah.numberInSurah && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => playRecording(recordedAudios[ayah.numberInSurah])}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                                theme === 'dark'
                                  ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
                                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
                              }`}
                            >
                              <Play className="w-3 h-3 fill-current" />
                              Listen to Me
                            </button>
                            <button
                              onClick={() => getPronunciationFeedback(ayah, recordedAudios[ayah.numberInSurah])}
                              disabled={isGeneratingAi[ayah.numberInSurah]}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                                theme === 'dark'
                                  ? 'bg-teal-900/40 text-teal-400 hover:bg-teal-800/60'
                                  : 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                              } disabled:opacity-50`}
                            >
                              {isGeneratingAi[ayah.numberInSurah] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                              AI Feedback
                            </button>
                            <button
                              onClick={() => deleteRecording(ayah.numberInSurah)}
                              className={`p-1.5 rounded-full transition-all ${
                                theme === 'dark'
                                  ? 'text-red-400 hover:bg-red-900/20'
                                  : 'text-red-600 hover:bg-red-50'
                              }`}
                              title="Delete recording"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => getAiInsights(ayah)}
                            disabled={isGeneratingAi[ayah.numberInSurah]}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                              theme === 'dark'
                                ? 'bg-emerald-900/40 text-emerald-400 hover:bg-emerald-800/60'
                                : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            } disabled:opacity-50`}
                          >
                            {isGeneratingAi[ayah.numberInSurah] ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageSquare className="w-3 h-3" />}
                            AI Insights
                          </button>
                          <button
                            onClick={() => readWithAi(ayah)}
                            disabled={isReadingAi[ayah.numberInSurah]}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                              theme === 'dark'
                                ? 'bg-emerald-900/40 text-emerald-400 hover:bg-emerald-800/60'
                                : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            } disabled:opacity-50`}
                          >
                            {isReadingAi[ayah.numberInSurah] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume1 className="w-3 h-3" />}
                            Read Translation
                          </button>
                          {recordedAudios[ayah.numberInSurah] && recordingAyahId !== ayah.numberInSurah && (
                            <button
                              onClick={() => setActiveCompareAyah(activeCompareAyah === ayah.numberInSurah ? null : ayah.numberInSurah)}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                                theme === 'dark'
                                  ? activeCompareAyah === ayah.numberInSurah ? 'bg-indigo-900/60 text-indigo-300' : 'bg-indigo-900/30 text-indigo-400 hover:bg-indigo-800/50'
                                  : activeCompareAyah === ayah.numberInSurah ? 'bg-indigo-200 text-indigo-800' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                              }`}
                            >
                              <GitCompare className="w-3 h-3" />
                              {activeCompareAyah === ayah.numberInSurah ? 'Close Compare' : 'Compare with AI'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Side-by-Side Comparison UI */}
                      <AnimatePresence>
                        {activeCompareAyah === ayah.numberInSurah && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className={`mt-4 overflow-hidden rounded-xl border transition-all ${
                              theme === 'dark' ? 'border-indigo-900/50 bg-indigo-950/20' : 'border-indigo-200 bg-indigo-50/50'
                            }`}
                          >
                            <div className="p-4 flex flex-col gap-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* User Recording Box */}
                                <div className={`p-4 rounded-lg border flex flex-col items-center justify-center gap-3 ${
                                  theme === 'dark' ? 'bg-emerald-900/20 border-emerald-800/30' : 'bg-white border-emerald-100'
                                }`}>
                                  <div className={`text-xs font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`}>Your Recitation</div>
                                  <button
                                    onClick={() => playRecording(recordedAudios[ayah.numberInSurah])}
                                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                                      theme === 'dark' ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400' : 'bg-emerald-600 text-white hover:bg-emerald-500'
                                    }`}
                                  >
                                    <Play className="w-5 h-5 fill-current ml-1" />
                                  </button>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-[10px] uppercase font-bold ${theme === 'dark' ? 'text-emerald-500/70' : 'text-emerald-600/70'}`}>Speed:</span>
                                    <select
                                      value={userPlaybackRate}
                                      onChange={(e) => handleUserSpeedChange(parseFloat(e.target.value))}
                                      className={`text-xs rounded px-1 py-0.5 border focus:outline-none ${theme === 'dark' ? 'bg-emerald-900/40 border-emerald-800/50 text-emerald-100' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}
                                    >
                                      <option value={0.5}>0.5x</option>
                                      <option value={0.75}>0.75x</option>
                                      <option value={1}>1x</option>
                                      <option value={1.25}>1.25x</option>
                                      <option value={1.5}>1.5x</option>
                                    </select>
                                  </div>
                                </div>

                                {/* AI Recitation Box */}
                                <div className={`p-4 rounded-lg border flex flex-col items-center justify-center gap-3 ${
                                  theme === 'dark' ? 'bg-indigo-900/20 border-indigo-800/30' : 'bg-white border-indigo-100'
                                }`}>
                                  <div className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${theme === 'dark' ? 'text-indigo-400' : 'text-indigo-600'}`}>
                                    <Sparkles className="w-3 h-3" /> AI Recitation
                                  </div>
                                  <button
                                    onClick={() => playAiArabic(ayah)}
                                    disabled={isGeneratingAiArabic[ayah.numberInSurah]}
                                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all disabled:opacity-50 ${
                                      theme === 'dark' ? 'bg-indigo-500 text-indigo-950 hover:bg-indigo-400' : 'bg-indigo-600 text-white hover:bg-indigo-500'
                                    }`}
                                  >
                                    {isGeneratingAiArabic[ayah.numberInSurah] ? (
                                      <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                      <Play className="w-5 h-5 fill-current ml-1" />
                                    )}
                                  </button>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-[10px] uppercase font-bold ${theme === 'dark' ? 'text-indigo-500/70' : 'text-indigo-600/70'}`}>Speed:</span>
                                    <select
                                      value={aiPlaybackRate}
                                      onChange={(e) => handleAiSpeedChange(parseFloat(e.target.value))}
                                      className={`text-xs rounded px-1 py-0.5 border focus:outline-none ${theme === 'dark' ? 'bg-indigo-900/40 border-indigo-800/50 text-indigo-100' : 'bg-indigo-50 border-indigo-200 text-indigo-900'}`}
                                    >
                                      <option value={0.5}>0.5x</option>
                                      <option value={0.75}>0.75x</option>
                                      <option value={1}>1x</option>
                                      <option value={1.25}>1.25x</option>
                                      <option value={1.5}>1.5x</option>
                                    </select>
                                  </div>
                                </div>
                              </div>

                              {/* Detailed Analysis Section */}
                              <div className="flex flex-col items-center mt-2">
                                {!detailedAnalysis[ayah.numberInSurah] ? (
                                  <button
                                    onClick={() => getDetailedAnalysis(ayah, recordedAudios[ayah.numberInSurah])}
                                    disabled={isAnalyzing[ayah.numberInSurah]}
                                    className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold transition-all w-full md:w-auto justify-center ${
                                      theme === 'dark'
                                        ? 'bg-gradient-to-r from-indigo-600 to-emerald-600 text-white hover:from-indigo-500 hover:to-emerald-500'
                                        : 'bg-gradient-to-r from-indigo-500 to-emerald-500 text-white hover:from-indigo-600 hover:to-emerald-600'
                                    } disabled:opacity-50`}
                                  >
                                    {isAnalyzing[ayah.numberInSurah] ? (
                                      <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing Pronunciation...</>
                                    ) : (
                                      <><Sparkles className="w-4 h-4" /> Get Detailed AI Analysis</>
                                    )}
                                  </button>
                                ) : (
                                  <div className={`w-full p-5 rounded-xl border text-sm leading-relaxed prose prose-sm max-w-none ${
                                    theme === 'dark' 
                                      ? 'bg-black/20 border-indigo-500/30 text-indigo-100 prose-invert prose-headings:text-indigo-300 prose-strong:text-indigo-200' 
                                      : 'bg-white/50 border-indigo-200 text-indigo-900 prose-headings:text-indigo-800 prose-strong:text-indigo-700'
                                  }`}>
                                    <Markdown>{detailedAnalysis[ayah.numberInSurah]}</Markdown>
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* AI Content Display */}
                      <AnimatePresence>
                        {(aiInsights[ayah.numberInSurah] || aiFeedback[ayah.numberInSurah]) && !activeCompareAyah && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className={`mt-3 p-4 rounded-xl border text-xs leading-relaxed space-y-3 transition-all ${
                              theme === 'dark'
                                ? 'bg-emerald-900/20 border-emerald-800/30 text-emerald-200'
                                : 'bg-emerald-50 border-emerald-100 text-emerald-800'
                            }`}
                          >
                            {aiInsights[ayah.numberInSurah] && (
                              <div>
                                <div className="flex items-center gap-2 font-bold mb-1 text-emerald-500">
                                  <Sparkles className="w-3 h-3" />
                                  AI INSIGHTS
                                </div>
                                <p>{aiInsights[ayah.numberInSurah]}</p>
                              </div>
                            )}
                            {aiFeedback[ayah.numberInSurah] && (
                              <div className={`pt-2 border-t ${theme === 'dark' ? 'border-emerald-800/30' : 'border-emerald-100'}`}>
                                <div className="flex items-center gap-2 font-bold mb-1 text-teal-500">
                                  <Mic className="w-3 h-3" />
                                  PRONUNCIATION FEEDBACK
                                </div>
                                <p>{aiFeedback[ayah.numberInSurah]}</p>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Player Chrome */}
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-4xl backdrop-blur-xl border rounded-3xl p-4 md:p-6 shadow-2xl z-20 transition-all ${
          theme === 'dark' 
            ? 'bg-emerald-950/90 border-emerald-800/50' 
            : 'bg-white/90 border-emerald-200'
        }`}>
          <audio
            ref={audioRef}
            src={getAudioUrl(currentSurah.id)}
            onTimeUpdate={handleTimeUpdate}
            onEnded={playNext}
            onLoadedMetadata={handleTimeUpdate}
            muted={isMuted}
          />
          
          <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8">
            {/* Current Track Info */}
            <div className="flex-1 text-center md:text-left w-full hidden md:block">
              <h2 className={`text-xl font-serif mb-1 transition-colors ${
                theme === 'dark' ? 'text-emerald-300' : 'text-emerald-700'
              }`}>{currentSurah.name_arabic}</h2>
              <p className={`text-sm transition-colors ${
                theme === 'dark' ? 'text-emerald-200/60' : 'text-emerald-600/60'
              }`}>{currentSurah.name_english}</p>
            </div>

            {/* Controls */}
            <div className="flex flex-col items-center w-full md:w-auto flex-2">
              <div className="flex items-center space-x-6 mb-3">
                <button 
                  onClick={playPrevious}
                  disabled={currentSurah.id === 1}
                  className={`transition-colors disabled:opacity-30 ${
                    theme === 'dark' ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-600 hover:text-emerald-500'
                  }`}
                >
                  <SkipBack className="w-6 h-6" fill="currentColor" />
                </button>
                
                <button 
                  onClick={togglePlay}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg ${
                    theme === 'dark' 
                      ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400 shadow-emerald-500/20' 
                      : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-600/20'
                  }`}
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6" fill="currentColor" />
                  ) : (
                    <Play className="w-6 h-6 ml-1" fill="currentColor" />
                  )}
                </button>

                <button 
                  onClick={playNext}
                  disabled={currentSurah.id === 114}
                  className={`transition-colors disabled:opacity-30 ${
                    theme === 'dark' ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-600 hover:text-emerald-500'
                  }`}
                >
                  <SkipForward className="w-6 h-6" fill="currentColor" />
                </button>
              </div>

              {/* Progress Bar */}
              <div className={`flex items-center w-full space-x-3 text-xs font-mono transition-colors ${
                theme === 'dark' ? 'text-emerald-400/60' : 'text-emerald-600/60'
              }`}>
                <span>{formatTime(progress)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={progress}
                  onChange={handleSeek}
                  className={`flex-1 h-1.5 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full transition-all ${
                    theme === 'dark' 
                      ? 'bg-emerald-900/50 [&::-webkit-slider-thumb]:bg-emerald-400' 
                      : 'bg-emerald-100 [&::-webkit-slider-thumb]:bg-emerald-600'
                  }`}
                />
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Volume */}
            <div className="hidden md:flex flex-1 justify-end items-center">
              <button 
                onClick={toggleMute}
                className={`transition-colors ${
                  theme === 'dark' ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-600 hover:text-emerald-500'
                }`}
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <style>{`
        .custom-scrollbar.dark::-webkit-scrollbar-track {
          background: rgba(6, 78, 59, 0.1);
        }
        .custom-scrollbar.dark::-webkit-scrollbar-thumb {
          background: rgba(16, 185, 129, 0.2);
        }
        .custom-scrollbar.light::-webkit-scrollbar-track {
          background: rgba(16, 185, 129, 0.05);
        }
        .custom-scrollbar.light::-webkit-scrollbar-thumb {
          background: rgba(16, 185, 129, 0.15);
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(16, 185, 129, 0.4);
        }
      `}</style>
    </div>
  );
}

