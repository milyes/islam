/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { surahs } from './data/surahs';

export default function App() {
  const [currentSurah, setCurrentSurah] = useState(surahs[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const audioRef = useRef<HTMLAudioElement>(null);

  const filteredSurahs = surahs.filter(s => 
    s.name_arabic.includes(searchQuery) || 
    s.name_english.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Format ID to 3 digits for the URL (e.g., 1 -> 001)
  const getAudioUrl = (id: number) => {
    const paddedId = id.toString().padStart(3, '0');
    return `https://server7.mp3quran.net/shur/${paddedId}.mp3`;
  };

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

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-emerald-50 font-sans selection:bg-emerald-900/50">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full bg-emerald-900/20 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-teal-900/20 blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-8 h-screen flex flex-col">
        {/* Header */}
        <header className="flex flex-col items-center justify-center mb-10 space-y-2">
          <h1 className="text-4xl md:text-5xl font-serif text-emerald-400 tracking-wide text-center">
            القرآن الكريم
          </h1>
          <p className="text-emerald-200/60 text-lg tracking-widest uppercase font-medium">
            بصوت الشيخ سعود الشريم
          </p>
        </header>

        {/* Search */}
        <div className="relative mb-8 max-w-md mx-auto w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-emerald-500/50" />
          </div>
          <input
            type="text"
            placeholder="Search Surah..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-emerald-950/30 border border-emerald-800/30 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-emerald-100 placeholder-emerald-500/50 transition-all backdrop-blur-sm"
          />
        </div>

        {/* Surah List */}
        <div className="flex-1 overflow-y-auto pr-2 pb-32 space-y-2 custom-scrollbar">
          {filteredSurahs.map((surah) => (
            <motion.button
              key={surah.id}
              whileHover={{ scale: 1.01, backgroundColor: 'rgba(6, 78, 59, 0.4)' }}
              whileTap={{ scale: 0.99 }}
              onClick={() => playSurah(surah)}
              className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all border ${
                currentSurah.id === surah.id 
                  ? 'bg-emerald-900/40 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]' 
                  : 'bg-emerald-950/20 border-transparent hover:border-emerald-800/30'
              }`}
            >
              <div className="flex items-center space-x-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-mono text-sm ${
                  currentSurah.id === surah.id ? 'bg-emerald-500 text-emerald-950' : 'bg-emerald-900/50 text-emerald-400'
                }`}>
                  {surah.id}
                </div>
                <div className="text-left">
                  <h3 className="font-medium text-lg text-emerald-50">{surah.name_english}</h3>
                  <p className="text-sm text-emerald-400/60">Surah {surah.id}</p>
                </div>
              </div>
              <div className="text-2xl font-serif text-emerald-300">
                {surah.name_arabic}
              </div>
            </motion.button>
          ))}
          {filteredSurahs.length === 0 && (
            <div className="text-center text-emerald-500/50 py-10">
              No Surahs found matching "{searchQuery}"
            </div>
          )}
        </div>

        {/* Player Chrome */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-3xl bg-emerald-950/80 backdrop-blur-xl border border-emerald-800/50 rounded-3xl p-4 md:p-6 shadow-2xl">
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
            <div className="flex-1 text-center md:text-left w-full">
              <h2 className="text-xl font-serif text-emerald-300 mb-1">{currentSurah.name_arabic}</h2>
              <p className="text-sm text-emerald-200/60">{currentSurah.name_english}</p>
            </div>

            {/* Controls */}
            <div className="flex flex-col items-center w-full md:w-auto flex-2">
              <div className="flex items-center space-x-6 mb-3">
                <button 
                  onClick={playPrevious}
                  disabled={currentSurah.id === 1}
                  className="text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-30"
                >
                  <SkipBack className="w-6 h-6" fill="currentColor" />
                </button>
                
                <button 
                  onClick={togglePlay}
                  className="w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-400 flex items-center justify-center text-emerald-950 transition-transform hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
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
                  className="text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-30"
                >
                  <SkipForward className="w-6 h-6" fill="currentColor" />
                </button>
              </div>

              {/* Progress Bar */}
              <div className="flex items-center w-full space-x-3 text-xs font-mono text-emerald-400/60">
                <span>{formatTime(progress)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={progress}
                  onChange={handleSeek}
                  className="flex-1 h-1.5 bg-emerald-900/50 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:rounded-full"
                />
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Volume */}
            <div className="hidden md:flex flex-1 justify-end items-center">
              <button 
                onClick={toggleMute}
                className="text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(6, 78, 59, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(16, 185, 129, 0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(16, 185, 129, 0.4);
        }
      `}</style>
    </div>
  );
}

