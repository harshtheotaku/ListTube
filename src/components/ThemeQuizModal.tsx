import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Eye,
  EyeOff,
  Loader2,
  Music,
  Pause,
  Play,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { triggerHaptic } from '../services/haptics';
import {
  buildThemeQuizRound,
  getQuizHighScore,
  resolveThemePreviewAudio,
  saveQuizHighScore,
  ThemeAudioTrack,
} from '../services/themeQuiz';

interface ThemeQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function fmtSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const ThemeQuizModal: React.FC<ThemeQuizModalProps> = ({ isOpen, onClose }) => {
  const [seed, setSeed] = useState(0);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [best, setBest] = useState(() => getQuizHighScore());
  const [blindMode, setBlindMode] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<ThemeAudioTrack | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState({ cur: 0, dur: 30 });

  const questions = useMemo(() => buildThemeQuizRound(8), [seed]);
  const finished = idx >= questions.length;
  const q = !finished ? questions[idx] : undefined;

  useEffect(() => {
    if (!isOpen || !q) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    let cancelled = false;
    setAudioLoading(true);
    setTrack(null);
    setPlaying(false);
    setProgress({ cur: 0, dur: 30 });
    audioRef.current?.pause();

    resolveThemePreviewAudio(q)
      .then((res) => {
        if (cancelled) return;
        setTrack(res);
      })
      .finally(() => {
        if (!cancelled) setAudioLoading(false);
      });

    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
  }, [isOpen, q?.id]);

  useEffect(() => {
    if (!track?.previewUrl || !audioRef.current) return;
    const el = audioRef.current;
    el.muted = muted;
    el.currentTime = 0;
    const tryPlay = async () => {
      try {
        await el.play();
        setPlaying(true);
      } catch {
        // Browser autoplay policy may wait for user tap on Play button
        setPlaying(false);
      }
    };
    void tryPlay();
  }, [track?.previewUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  if (!isOpen) return null;

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el || !track?.previewUrl) return;
    triggerHaptic('light');
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      try {
        await el.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    }
  };

  const handleAnswer = (opt: string) => {
    if (picked || !q) return;
    setPicked(opt);
    if (opt === q.correctAnswer) {
      triggerHaptic('success');
      const nextScore = score + 100 + streak * 25;
      setScore(nextScore);
      setStreak((s) => s + 1);
      if (nextScore > best) {
        setBest(nextScore);
        saveQuizHighScore(nextScore);
      }
    } else {
      triggerHaptic('medium');
      setStreak(0);
    }
  };

  const nextQuestion = () => {
    triggerHaptic('light');
    audioRef.current?.pause();
    setPlaying(false);
    setPicked(null);
    setIdx((i) => i + 1);
  };

  const restart = () => {
    triggerHaptic('medium');
    audioRef.current?.pause();
    setPlaying(false);
    setSeed((s) => s + 1);
    setIdx(0);
    setScore(0);
    setStreak(0);
    setPicked(null);
  };

  const pct = progress.dur > 0 ? Math.min(100, (progress.cur / progress.dur) * 100) : 0;

  return (
    <div
      className="lt-backdrop-in fixed inset-0 z-[85] flex items-end justify-center bg-black/80 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="OP and ED Music Quiz"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          audioRef.current?.pause();
          onClose();
        }
      }}
    >
      <div className="liquid-glass lt-sheet-up w-full max-w-lg overflow-hidden rounded-t-[30px] border border-white/[0.16] p-6 text-white shadow-2xl sm:rounded-[28px]">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/25 sm:hidden" />
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF0000]/20 text-[#FF0000]">
              <Music className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-[15.5px] font-bold text-white">Anime OP/ED Music Quiz</h2>
              <p className="text-[11px] text-[#AAAAAA]">
                Score: <strong className="text-white">{score}</strong> · Streak: {streak} · Best: {best}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setBlindMode((v) => !v)}
              title="Blind audio mode hides song title until answered"
              className={`lt-press inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold transition ${
                blindMode ? 'bg-[#3EA6FF]/20 text-[#3EA6FF]' : 'bg-white/[0.08] text-[#CCCCCC]'
              }`}
            >
              {blindMode ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {blindMode ? 'Blind' : 'Title On'}
            </button>
            <button
              type="button"
              onClick={() => {
                audioRef.current?.pause();
                onClose();
              }}
              aria-label="Close quiz"
              className="lt-press rounded-full bg-white/10 p-1.5 text-neutral-300 hover:bg-white/20 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <audio
          ref={audioRef}
          src={track?.previewUrl}
          preload="auto"
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            setProgress({ cur: el.currentTime, dur: el.duration || 30 });
          }}
          onEnded={() => setPlaying(false)}
        />

        {finished ? (
          <div className="space-y-4 py-6 text-center">
            <Trophy className="mx-auto h-12 w-12 text-amber-300" />
            <div>
              <p className="text-[20px] font-black text-white">Round Complete!</p>
              <p className="mt-1 text-[13px] text-[#AAAAAA]">
                Final Score: <strong className="text-white">{score}</strong> (High Score: {best})
              </p>
            </div>
            <button
              type="button"
              onClick={restart}
              className="lt-press inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-[12.5px] font-bold text-black hover:bg-neutral-200"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Play New Round
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Built-in In-App Music Player Card */}
            <div className="space-y-3 rounded-2xl border border-white/[0.1] bg-white/[0.05] p-4">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#3EA6FF]">
                <span>
                  Question {idx + 1} of {questions.length}
                </span>
                <span className="text-[10.5px] font-semibold text-emerald-300">
                  In-App Studio Preview
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={audioLoading || !track?.previewUrl}
                  onClick={() => void togglePlay()}
                  aria-label={playing ? 'Pause theme song' : 'Play theme song'}
                  className="lt-press flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#FF0000] text-white shadow-lg transition hover:bg-[#D90000] disabled:opacity-45"
                >
                  {audioLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : playing ? (
                    <Pause className="h-5 w-5 fill-current" />
                  ) : (
                    <Play className="ml-0.5 h-5 w-5 fill-current" />
                  )}
                </button>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-bold text-white">
                      {blindMode && !picked
                        ? 'Mystery Opening / Ending Track'
                        : `${q!.songTitle} · ${q!.artist}`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setMuted((m) => !m)}
                      aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                      className="rounded-full p-1 text-[#AAAAAA] hover:bg-white/10 hover:text-white"
                    >
                      {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  {/* Interactive Audio Scrubber */}
                  <div
                    role="slider"
                    aria-label="Audio progress"
                    aria-valuemin={0}
                    aria-valuemax={Math.round(progress.dur)}
                    aria-valuenow={Math.round(progress.cur)}
                    tabIndex={0}
                    onClick={(e) => {
                      const el = audioRef.current;
                      if (!el || !track?.previewUrl) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                      el.currentTime = ratio * (el.duration || 30);
                    }}
                    className="h-2 cursor-pointer overflow-hidden rounded-full bg-white/15"
                  >
                    <div
                      className="h-full rounded-full bg-[#FF0000] transition-all duration-150"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-[#AAAAAA]">
                    <span>{fmtSec(progress.cur)}</span>
                    <span>
                      {audioLoading
                        ? 'Loading audio preview…'
                        : track?.previewUrl
                        ? fmtSec(progress.dur)
                        : 'Preview unavailable offline'}
                    </span>
                  </div>
                </div>
              </div>

              <p className="border-t border-white/[0.06] pt-2.5 text-[14.5px] font-bold text-white">
                {blindMode && !picked
                  ? 'Listen to the track above and guess the anime!'
                  : q!.prompt}
              </p>
            </div>

            <div className="space-y-2">
              {q!.options.map((opt) => {
                const isCorrect = opt === q!.correctAnswer;
                const isSelected = picked === opt;
                const cls = picked
                  ? isCorrect
                    ? 'border-emerald-400/70 bg-emerald-500/20 text-white'
                    : isSelected
                    ? 'border-rose-400/70 bg-rose-500/20 text-rose-200'
                    : 'border-white/[0.06] bg-white/[0.03] text-[#888888]'
                  : 'border-white/[0.1] bg-white/[0.05] text-white hover:bg-white/[0.12]';

                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={Boolean(picked)}
                    onClick={() => handleAnswer(opt)}
                    className={`lt-press flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-[13px] font-semibold transition ${cls}`}
                  >
                    <span>{opt}</span>
                    {picked && isCorrect && <Check className="h-4 w-4 text-emerald-300" />}
                  </button>
                );
              })}
            </div>

            {picked && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={nextQuestion}
                  className="lt-press rounded-full bg-white px-5 py-2 text-[12px] font-bold text-black hover:bg-neutral-200"
                >
                  {idx + 1 >= questions.length ? 'Finish Quiz' : 'Next Question →'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
