import React, { useMemo, useState } from 'react';
import {
  Check,
  ExternalLink,
  Music,
  Play,
  RotateCcw,
  Trophy,
  X,
} from 'lucide-react';
import {
  buildThemeQuizRound,
  getQuizHighScore,
  saveQuizHighScore,
} from '../services/themeQuiz';

interface ThemeQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThemeQuizModal: React.FC<ThemeQuizModalProps> = ({ isOpen, onClose }) => {
  const [seed, setSeed] = useState(0);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [best, setBest] = useState(() => getQuizHighScore());

  const questions = useMemo(() => buildThemeQuizRound(8), [seed]);
  if (!isOpen) return null;

  const finished = idx >= questions.length;
  const q = questions[idx];

  const handleAnswer = (opt: string) => {
    if (picked || !q) return;
    setPicked(opt);
    if (opt === q.correctAnswer) {
      const nextScore = score + 100 + streak * 25;
      setScore(nextScore);
      setStreak((s) => s + 1);
      if (nextScore > best) {
        setBest(nextScore);
        saveQuizHighScore(nextScore);
      }
    } else {
      setStreak(0);
    }
  };

  const nextQuestion = () => {
    setPicked(null);
    setIdx((i) => i + 1);
  };

  const restart = () => {
    setSeed((s) => s + 1);
    setIdx(0);
    setScore(0);
    setStreak(0);
    setPicked(null);
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="OP and ED Music Quiz"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="liquid-glass w-full max-w-lg overflow-hidden rounded-[28px] border border-white/[0.16] p-6 text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FF0000]/20 text-[#FF0000]">
              <Music className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-[15.5px] font-bold text-white">Anime OP/ED Music Quiz</h2>
              <p className="text-[11px] text-[#AAAAAA]">
                Score: <strong className="text-white">{score}</strong> · Streak: {streak} · Best: {best}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quiz"
            className="rounded-full bg-white/10 p-1.5 text-neutral-300 hover:bg-white/20 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

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
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-[12.5px] font-bold text-black hover:bg-neutral-200"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Play New Round
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-white/[0.1] bg-white/[0.05] p-4">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#3EA6FF]">
                <span>
                  Question {idx + 1} of {questions.length}
                </span>
                <a
                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(q.youtubeQuery)}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 rounded-full bg-[#FF0000]/20 px-2.5 py-0.5 text-[10.5px] font-bold text-rose-300 hover:bg-[#FF0000]/35"
                >
                  <Play className="h-3 w-3 fill-current" />
                  Preview Song
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
              <p className="mt-2 text-[15px] font-bold text-white">{q.prompt}</p>
              <p className="mt-1 text-[11.5px] text-[#AAAAAA]">Artist: {q.artist}</p>
            </div>

            <div className="space-y-2">
              {q.options.map((opt) => {
                const isCorrect = opt === q.correctAnswer;
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
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-[13px] font-semibold transition ${cls}`}
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
                  className="rounded-full bg-white px-5 py-2 text-[12px] font-bold text-black hover:bg-neutral-200"
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
