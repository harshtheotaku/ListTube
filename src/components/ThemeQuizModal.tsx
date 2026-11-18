import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Crown,
  Eye,
  EyeOff,
  Flame,
  Grid,
  HelpCircle,
  Keyboard,
  ListChecks,
  Loader2,
  Music,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { triggerHaptic } from '../services/haptics';
import {
  buildJeopardyBoard,
  buildThemeQuizRound,
  doesTypedGuessMatch,
  getJeopardyHighScore,
  getQuizHighScore,
  JeopardyCategory,
  JeopardyCell,
  QuizDifficultyTier,
  resolveThemePreviewAudio,
  saveJeopardyHighScore,
  saveQuizHighScore,
  SNIPPET_LADDER,
  ThemeAudioTrack,
} from '../services/themeQuiz';

interface ThemeQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalGameMode = 'impossible_op' | 'jeopardy';

function fmtSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return sec < 10 && m === 0 && !Number.isInteger(sec)
    ? `0:${s.toFixed(1).padStart(4, '0')}`
    : `${m}:${String(Math.floor(s)).padStart(2, '0')}`;
}

export const ThemeQuizModal: React.FC<ThemeQuizModalProps> = ({ isOpen, onClose }) => {
  const [gameMode, setGameMode] = useState<ModalGameMode>('impossible_op');
  const [difficulty, setDifficulty] = useState<QuizDifficultyTier>('heralen');
  const [typeAnswerMode, setTypeAnswerMode] = useState(false);
  const [typedGuess, setTypedGuess] = useState('');
  const [blindMode, setBlindMode] = useState(true);

  // Impossible / OP Blitz round state
  const [seed, setSeed] = useState(0);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [snippetStep, setSnippetStep] = useState(0);
  const [hintStep, setHintStep] = useState(0);
  const [bestOpScore, setBestOpScore] = useState(() => getQuizHighScore());

  // Heralen Jeopardy Board state
  const [boardSeed, setBoardSeed] = useState(0);
  const [twoPlayer, setTwoPlayer] = useState(false);
  const [activePlayer, setActivePlayer] = useState<0 | 1>(0);
  const [playerScores, setPlayerScores] = useState<[number, number]>([0, 0]);
  const [bestJeopardy, setBestJeopardy] = useState(() => getJeopardyHighScore());
  const [activeCell, setActiveCell] = useState<JeopardyCell | null>(null);
  const [solvedCells, setSolvedCells] = useState<Record<string, 'right' | 'wrong'>>({});
  const [cellHintLevel, setCellHintLevel] = useState(0);
  const [cellClipBoost, setCellClipBoost] = useState(0);
  const [cellPicked, setCellPicked] = useState<string | null>(null);

  // Audio preview state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<ThemeAudioTrack | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState({ cur: 0, dur: 30 });

  const questions = useMemo(() => buildThemeQuizRound(8), [seed]);
  const opFinished = idx >= questions.length;
  const activeOpQuestion = gameMode === 'impossible_op' && !opFinished ? questions[idx] : undefined;

  const boardCategories: JeopardyCategory[] = useMemo(
    () => buildJeopardyBoard(),
    [boardSeed]
  );
  const totalBoardCells = useMemo(
    () => boardCategories.reduce((sum, c) => sum + c.cells.length, 0),
    [boardCategories]
  );
  const boardComplete = Object.keys(solvedCells).length >= totalBoardCells && totalBoardCells > 0;

  // Determine active audio query + snippet time limit based on current mode/tile
  const activeAudioTarget = useMemo(() => {
    if (gameMode === 'impossible_op' && activeOpQuestion) {
      const ladder = SNIPPET_LADDER[difficulty];
      const maxClip = picked
        ? 30
        : ladder[Math.min(snippetStep, ladder.length - 1)] ?? 30;
      return {
        id: activeOpQuestion.id,
        audioQuery: activeOpQuestion.audioQuery,
        songTitle: activeOpQuestion.songTitle,
        artist: activeOpQuestion.artist,
        maxClipSec: maxClip,
      };
    }
    if (gameMode === 'jeopardy' && activeCell?.kind === 'audio') {
      const base = activeCell.initialClipSec ?? 6;
      const maxClip = cellPicked ? 30 : Math.min(30, base + cellClipBoost * 4);
      return {
        id: activeCell.id,
        audioQuery: activeCell.audioQuery,
        songTitle: activeCell.songTitle,
        artist: activeCell.artist,
        maxClipSec: maxClip,
      };
    }
    return null;
  }, [gameMode, activeOpQuestion, difficulty, snippetStep, picked, activeCell, cellClipBoost, cellPicked]);

  useEffect(() => {
    if (!isOpen || !activeAudioTarget) {
      audioRef.current?.pause();
      setPlaying(false);
      setTrack(null);
      return;
    }
    let cancelled = false;
    setAudioLoading(true);
    setTrack(null);
    setPlaying(false);
    setProgress({ cur: 0, dur: 30 });
    audioRef.current?.pause();

    resolveThemePreviewAudio(activeAudioTarget)
      .then((res) => {
        if (!cancelled) setTrack(res);
      })
      .finally(() => {
        if (!cancelled) setAudioLoading(false);
      });

    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
  }, [isOpen, activeAudioTarget?.id]);

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
      const cap = activeAudioTarget?.maxClipSec ?? 30;
      if (el.currentTime >= cap - 0.1) el.currentTime = 0;
      try {
        await el.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    }
  };

  // --- Impossible OP Mode handlers ---
  const ladder = SNIPPET_LADDER[difficulty];
  const baseOpPoints = difficulty === 'impossible' ? 400 : difficulty === 'heralen' ? 250 : 120;
  const potentialOpPoints = Math.max(
    50,
    baseOpPoints - snippetStep * 60 - hintStep * 50 + streak * 25
  );

  const submitOpAnswer = (guess: string, isTyped = false) => {
    if (picked || !activeOpQuestion) return;
    const isCorrect = isTyped
      ? doesTypedGuessMatch(guess, activeOpQuestion.correctAnswer, activeOpQuestion.aliases)
      : guess === activeOpQuestion.correctAnswer;

    setPicked(isCorrect ? activeOpQuestion.correctAnswer : guess);
    if (isCorrect) {
      triggerHaptic('success');
      const nextScore = score + potentialOpPoints;
      setScore(nextScore);
      setStreak((s) => s + 1);
      if (nextScore > bestOpScore) {
        setBestOpScore(nextScore);
        saveQuizHighScore(nextScore);
      }
    } else {
      triggerHaptic('medium');
      setStreak(0);
    }
  };

  const nextOpQuestion = () => {
    triggerHaptic('light');
    audioRef.current?.pause();
    setPlaying(false);
    setPicked(null);
    setTypedGuess('');
    setSnippetStep(0);
    setHintStep(0);
    setIdx((i) => i + 1);
  };

  const restartOpRound = () => {
    triggerHaptic('medium');
    audioRef.current?.pause();
    setPlaying(false);
    setSeed((s) => s + 1);
    setIdx(0);
    setScore(0);
    setStreak(0);
    setPicked(null);
    setTypedGuess('');
    setSnippetStep(0);
    setHintStep(0);
  };

  // --- Heralen Jeopardy handlers ---
  const openCell = (cell: JeopardyCell) => {
    if (solvedCells[cell.id]) return;
    triggerHaptic('light');
    setActiveCell(cell);
    setCellHintLevel(0);
    setCellClipBoost(0);
    setCellPicked(null);
    setTypedGuess('');
  };

  const effectiveCellReward = activeCell
    ? Math.max(
        50,
        (activeCell.isDailyDouble ? activeCell.points * 2 : activeCell.points) -
          cellHintLevel * 50 -
          cellClipBoost * 50
      )
    : 0;

  const submitJeopardyAnswer = (guess: string, isTyped = false) => {
    if (!activeCell || cellPicked) return;
    const isCorrect = isTyped
      ? doesTypedGuessMatch(guess, activeCell.correctAnswer, activeCell.aliases)
      : guess === activeCell.correctAnswer;

    setCellPicked(isCorrect ? activeCell.correctAnswer : guess);
    const cellDelta = isCorrect ? effectiveCellReward : -Math.round(activeCell.points / 2);

    const nextScores: [number, number] = [...playerScores] as [number, number];
    nextScores[activePlayer] = nextScores[activePlayer] + cellDelta;
    setPlayerScores(nextScores);
    setSolvedCells((prev) => ({
      ...prev,
      [activeCell.id]: isCorrect ? 'right' : 'wrong',
    }));

    if (isCorrect) {
      triggerHaptic('success');
      const topScore = Math.max(nextScores[0], twoPlayer ? nextScores[1] : nextScores[0]);
      if (topScore > bestJeopardy) {
        setBestJeopardy(topScore);
        saveJeopardyHighScore(topScore);
      }
    } else {
      triggerHaptic('medium');
    }
  };

  const closeActiveCell = () => {
    audioRef.current?.pause();
    setPlaying(false);
    setActiveCell(null);
    setCellPicked(null);
    setTypedGuess('');
    if (twoPlayer) setActivePlayer((p) => (p === 0 ? 1 : 0));
  };

  const restartJeopardy = () => {
    triggerHaptic('medium');
    audioRef.current?.pause();
    setPlaying(false);
    setBoardSeed((s) => s + 1);
    setPlayerScores([0, 0]);
    setActivePlayer(0);
    setActiveCell(null);
    setSolvedCells({});
    setCellPicked(null);
    setTypedGuess('');
  };

  const renderAudioCard = (label: string, titleText: string) => {
    const cap = activeAudioTarget?.maxClipSec ?? 30;
    const pct = progress.dur > 0 ? Math.min(100, (progress.cur / progress.dur) * 100) : 0;
    const capPct = Math.min(100, (cap / (progress.dur || 30)) * 100);
    return (
      <div className="space-y-2.5 rounded-2xl border border-white/[0.1] bg-white/[0.05] p-3.5">
        <div className="flex items-center justify-between text-[11px] font-bold text-[#3EA6FF]">
          <span>{label}</span>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
            {cap < 30 ? `Clip Limit: ${cap}s` : 'Full 30s Preview'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={audioLoading || !track?.previewUrl}
            onClick={() => void togglePlay()}
            aria-label={playing ? 'Pause theme song' : 'Play theme song'}
            className="lt-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FF0000] text-white shadow-lg transition hover:bg-[#D90000] disabled:opacity-45"
          >
            {audioLoading ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
            ) : playing ? (
              <Pause className="h-4.5 w-4.5 fill-current" />
            ) : (
              <Play className="ml-0.5 h-4.5 w-4.5 fill-current" />
            )}
          </button>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[12.5px] font-bold text-white">{titleText}</p>
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                className="rounded-full p-1 text-[#AAAAAA] hover:bg-white/10 hover:text-white"
              >
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
            </div>

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
                el.currentTime = Math.min(cap, ratio * (el.duration || 30));
              }}
              className="relative h-2 cursor-pointer overflow-hidden rounded-full bg-white/10"
            >
              <div
                className="absolute inset-y-0 left-0 bg-white/15"
                style={{ width: `${capPct}%` }}
              />
              <div
                className="relative z-10 h-full rounded-full bg-[#FF0000] transition-all duration-100"
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-[#AAAAAA]">
              <span>{fmtSec(progress.cur)}</span>
              <span>
                {audioLoading
                  ? 'Loading audio preview…'
                  : track?.previewUrl
                    ? `Playing up to ${cap}s`
                    : 'No studio preview — use clues below'}
              </span>
              <span>{fmtSec(cap)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAnswerInput = (
    options: string[],
    correctAnswer: string,
    selected: string | null,
    onSelectChoice: (opt: string) => void,
    onSubmitTyped: (val: string) => void,
    aliases?: string[]
  ) => {
    const isAnswered = selected !== null;
    if (typeAnswerMode && !isAnswered) {
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (typedGuess.trim()) onSubmitTyped(typedGuess.trim());
          }}
          className="space-y-2"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={typedGuess}
              onChange={(e) => setTypedGuess(e.target.value)}
              placeholder="Type anime title (or acronym like AOT, JJK, FMAB)…"
              autoFocus
              className="h-11 flex-1 rounded-xl border border-white/[0.14] bg-white/[0.06] px-3.5 text-[13px] font-medium text-white placeholder:text-neutral-500 outline-none focus:border-[#3EA6FF]"
            />
            <button
              type="submit"
              disabled={!typedGuess.trim()}
              className="lt-press h-11 rounded-xl bg-white px-4 text-[12.5px] font-bold text-black disabled:opacity-40"
            >
              Lock In
            </button>
          </div>
          <p className="text-[10.5px] text-neutral-400">
            Pro Heralen mode: forgiving spelling &amp; acronyms supported.
          </p>
        </form>
      );
    }

    if (typeAnswerMode && isAnswered) {
      const won =
        selected === correctAnswer ||
        doesTypedGuessMatch(selected ?? '', correctAnswer, aliases);
      return (
        <div
          className={`rounded-2xl border p-3.5 text-[13px] font-bold ${
            won
              ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
              : 'border-rose-400/40 bg-rose-500/15 text-rose-200'
          }`}
        >
          {won ? 'Spot on!' : `Missed — you guessed "${selected}"`} · Answer: {correctAnswer}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((opt) => {
          const isCorrect = opt === correctAnswer;
          const isPicked = selected === opt;
          let cls = 'border-white/[0.1] bg-white/[0.05] text-neutral-100 hover:bg-white/[0.12]';
          if (isAnswered) {
            if (isCorrect) cls = 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100';
            else if (isPicked) cls = 'border-rose-400/60 bg-rose-500/20 text-rose-100';
            else cls = 'border-white/[0.05] bg-white/[0.02] text-neutral-500';
          }
          return (
            <button
              key={opt}
              type="button"
              disabled={isAnswered}
              onClick={() => onSelectChoice(opt)}
              className={`lt-press flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-[12.5px] font-semibold transition ${cls}`}
            >
              <span className="truncate">{opt}</span>
              {isAnswered && isCorrect && <Check className="ml-1.5 h-4 w-4 shrink-0 text-emerald-300" />}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="lt-backdrop-in fixed inset-0 z-[85] flex items-end justify-center bg-black/82 p-0 backdrop-blur-md sm:items-center sm:p-4"
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
      <div className="liquid-glass lt-sheet-up flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[30px] border border-white/[0.16] p-5 text-white shadow-2xl sm:rounded-[28px] sm:p-6">
        <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-white/25 sm:hidden" />

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF0000] to-amber-500 text-white shadow-md">
              {gameMode === 'jeopardy' ? <Grid className="h-4 w-4" /> : <Music className="h-4 w-4" />}
            </span>
            <div>
              <h2 className="text-[15.5px] font-black tracking-tight text-white">
                Anime Quiz Show
              </h2>
              <p className="text-[11px] text-[#AAAAAA]">
                {gameMode === 'jeopardy'
                  ? `Jeopardy · Best: ${bestJeopardy} pts`
                  : `Score: ${score} · Streak: ${streak} · Best: ${bestOpScore}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTypeAnswerMode((v) => !v)}
              title="Toggle 4-choice options vs typing the answer yourself"
              className={`lt-press inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold transition ${
                typeAnswerMode
                  ? 'bg-amber-400/20 text-amber-200'
                  : 'bg-white/[0.08] text-[#CCCCCC]'
              }`}
            >
              {typeAnswerMode ? <Keyboard className="h-3 w-3" /> : <ListChecks className="h-3 w-3" />}
              {typeAnswerMode ? 'Type-In' : 'Choices'}
            </button>

            <button
              type="button"
              onClick={() => setBlindMode((v) => !v)}
              title="Blind mode hides song title until answered"
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

        {/* Game Mode Segmented Switcher */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex rounded-full bg-white/[0.06] p-1">
            <button
              type="button"
              onClick={() => {
                audioRef.current?.pause();
                setPlaying(false);
                setGameMode('impossible_op');
              }}
              className={`lt-press flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11.5px] font-bold transition ${
                gameMode === 'impossible_op'
                  ? 'bg-white text-black shadow'
                  : 'text-[#CCCCCC] hover:text-white'
              }`}
            >
              <Flame className="h-3.5 w-3.5 text-[#FF0000]" />
              Impossible OP/ED
            </button>
            <button
              type="button"
              onClick={() => {
                audioRef.current?.pause();
                setPlaying(false);
                setGameMode('jeopardy');
              }}
              className={`lt-press flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11.5px] font-bold transition ${
                gameMode === 'jeopardy'
                  ? 'bg-white text-black shadow'
                  : 'text-[#CCCCCC] hover:text-white'
              }`}
            >
              <Grid className="h-3.5 w-3.5 text-amber-500" />
              Anime Jeopardy
            </button>
          </div>

          {gameMode === 'impossible_op' ? (
            <div className="flex items-center gap-1 rounded-full bg-white/[0.06] p-1 text-[10.5px] font-bold">
              {(
                [
                  { id: 'chill', label: 'Chill (30s)' },
                  { id: 'heralen', label: 'Heralen (3s)' },
                  { id: 'impossible', label: 'Impossible (1.2s)' },
                ] as { id: QuizDifficultyTier; label: string }[]
              ).map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => {
                    setDifficulty(tier.id);
                    setSnippetStep(0);
                  }}
                  className={`rounded-full px-2.5 py-1 transition ${
                    difficulty === tier.id
                      ? 'bg-[#FF0000] text-white'
                      : 'text-[#AAAAAA] hover:text-white'
                  }`}
                >
                  {tier.label}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTwoPlayer((v) => !v);
                setActivePlayer(0);
              }}
              className={`lt-press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                twoPlayer
                  ? 'bg-[#3EA6FF]/20 text-[#3EA6FF] ring-1 ring-[#3EA6FF]/40'
                  : 'bg-white/[0.06] text-[#CCCCCC] hover:text-white'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              {twoPlayer ? '2P Versus On' : '1P Solo (Tap for 2P)'}
            </button>
          )}
        </div>

        {/* Shared In-App Audio Element with Clip Cutoff Enforcement */}
        <audio
          ref={audioRef}
          src={track?.previewUrl}
          preload="auto"
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            const cap = activeAudioTarget?.maxClipSec ?? 30;
            if (el.currentTime >= cap && !el.paused) {
              el.pause();
              el.currentTime = cap;
              setPlaying(false);
            }
            setProgress({ cur: el.currentTime, dur: el.duration || 30 });
          }}
          onEnded={() => setPlaying(false)}
        />

        {/* Scrollable Game Body */}
        <div className="mt-3.5 min-h-0 flex-1 overflow-y-auto pr-0.5">
          {gameMode === 'impossible_op' ? (
            opFinished ? (
              <div className="space-y-4 py-8 text-center">
                <Trophy className="mx-auto h-12 w-12 text-amber-300" />
                <div>
                  <p className="text-[20px] font-black text-white">Challenge Complete!</p>
                  <p className="mt-1 text-[13px] text-[#AAAAAA]">
                    Final Score: <strong className="text-white">{score}</strong> (Best: {bestOpScore})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={restartOpRound}
                  className="lt-press inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-[12.5px] font-bold text-black hover:bg-neutral-200"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Play Another Set
                </button>
              </div>
            ) : (
              <div className="space-y-3.5">
                {renderAudioCard(
                  `Round ${idx + 1} / ${questions.length} · Up to +${potentialOpPoints} pts`,
                  blindMode && !picked
                    ? 'Mystery Opening / Ending Snippet'
                    : `${activeOpQuestion!.songTitle} · ${activeOpQuestion!.artist}`
                )}

                {/* Escalating Clip Length + Clues Row */}
                {!picked && (
                  <div className="flex flex-wrap items-center gap-2">
                    {snippetStep < ladder.length - 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSnippetStep((s) => Math.min(ladder.length - 1, s + 1));
                          if (audioRef.current && track?.previewUrl) {
                            audioRef.current.currentTime = 0;
                            void audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
                          }
                        }}
                        className="lt-press inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1.5 text-[11px] font-bold text-amber-200 ring-1 ring-amber-400/30 hover:bg-amber-500/25"
                      >
                        <Sparkles className="h-3 w-3" />
                        Extend Clip to {ladder[snippetStep + 1]}s (-60 pts)
                      </button>
                    )}

                    {(activeOpQuestion?.clues?.length ?? 0) > hintStep && (
                      <button
                        type="button"
                        onClick={() => setHintStep((h) => h + 1)}
                        className="lt-press inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1.5 text-[11px] font-bold text-[#CCCCCC] hover:bg-white/[0.14]"
                      >
                        <HelpCircle className="h-3 w-3 text-[#3EA6FF]" />
                        Reveal Clue {hintStep + 1} (-50 pts)
                      </button>
                    )}
                  </div>
                )}

                {hintStep > 0 && activeOpQuestion?.clues && (
                  <div className="space-y-1 rounded-xl border border-white/[0.08] bg-white/[0.04] p-3 text-[12px] text-neutral-200">
                    {activeOpQuestion.clues.slice(0, hintStep).map((c, ci) => (
                      <p key={ci}>
                        <span className="font-bold text-[#3EA6FF]">Clue {ci + 1}:</span> {c}
                      </p>
                    ))}
                  </div>
                )}

                <p className="text-[14.5px] font-bold text-white">
                  {blindMode && !picked
                    ? 'Listen to the snippet — which anime is this theme from?'
                    : activeOpQuestion!.prompt}
                </p>

                {renderAnswerInput(
                  activeOpQuestion!.options,
                  activeOpQuestion!.correctAnswer,
                  picked,
                  (opt) => submitOpAnswer(opt, false),
                  (val) => submitOpAnswer(val, true),
                  activeOpQuestion!.aliases
                )}

                {picked && (
                  <div className="flex items-center justify-between border-t border-white/[0.08] pt-3">
                    <span className="text-[12px] font-semibold text-[#AAAAAA]">
                      {picked === activeOpQuestion!.correctAnswer
                        ? `Correct! "${activeOpQuestion!.songTitle}"`
                        : `${activeOpQuestion!.correctAnswer} — "${activeOpQuestion!.songTitle}"`}
                    </span>
                    <button
                      type="button"
                      onClick={nextOpQuestion}
                      className="lt-press rounded-full bg-[#FF0000] px-4 py-1.5 text-[12px] font-bold text-white hover:bg-[#D90000]"
                    >
                      {idx + 1 >= questions.length ? 'Finish' : 'Next ->'}
                    </button>
                  </div>
                )}
              </div>
            )
          ) : activeCell ? (
            /* Active Heralen Jeopardy Question Tile */
            <div className="space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={closeActiveCell}
                  className="flex items-center gap-1 rounded-full bg-white/[0.08] px-3 py-1 text-[11.5px] font-bold text-neutral-200 hover:bg-white/[0.15]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Board
                </button>
                <div className="flex items-center gap-2">
                  {activeCell.isDailyDouble && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[10.5px] font-black uppercase tracking-wider text-amber-300 ring-1 ring-amber-400/40">
                      <Crown className="h-3 w-3" />
                      Daily Double 2×
                    </span>
                  )}
                  <span className="rounded-full bg-[#3EA6FF]/15 px-3 py-0.5 text-[11.5px] font-black text-[#3EA6FF]">
                    Value: {effectiveCellReward} pts
                  </span>
                </div>
              </div>

              {activeCell.kind === 'audio' &&
                renderAudioCard(
                  `OP/ED Blitz · ${activeCell.points} pts`,
                  blindMode && !cellPicked
                    ? 'Mystery Opening / Ending'
                    : `${activeCell.songTitle} · ${activeCell.artist}`
                )}

              {activeCell.kind === 'visual_crop' && activeCell.imageUrl && (
                <div className="relative mx-auto aspect-video w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.12] bg-black">
                  <img
                    src={activeCell.imageUrl}
                    alt="Blurred anime challenge"
                    className={`h-full w-full object-cover transition-all duration-500 ${
                      cellPicked
                        ? 'scale-100 blur-0'
                        : cellHintLevel === 0
                          ? 'scale-[2.4] blur-[14px]'
                          : cellHintLevel === 1
                            ? 'scale-[1.7] blur-[7px]'
                            : 'scale-110 blur-[2px]'
                    }`}
                  />
                  {!cellPicked && (
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/75 px-2.5 py-1 text-[10px] font-bold text-white">
                      {cellHintLevel === 0 ? 'Ultra Crop' : cellHintLevel === 1 ? 'Zoomed Out' : 'Near Clear'}
                    </span>
                  )}
                </div>
              )}

              {/* Clues & Escalation Actions */}
              <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3.5">
                <p className="text-[14px] font-bold text-white">{activeCell.prompt}</p>
                <div className="space-y-1 text-[12px] text-neutral-300">
                  {(activeCell.kind === 'riddle_trivia'
                    ? activeCell.clues.slice(0, cellHintLevel + 1)
                    : activeCell.clues.slice(0, cellHintLevel)
                  ).map((clue, ci) => (
                    <p key={ci} className="rounded-lg bg-white/[0.04] px-2.5 py-1.5">
                      {clue}
                    </p>
                  ))}
                </div>
              </div>

              {!cellPicked && (
                <div className="flex flex-wrap items-center gap-2">
                  {activeCell.kind === 'audio' && (activeCell.initialClipSec ?? 6) + cellClipBoost * 4 < 25 && (
                    <button
                      type="button"
                      onClick={() => {
                        setCellClipBoost((b) => b + 1);
                        if (audioRef.current && track?.previewUrl) {
                          audioRef.current.currentTime = 0;
                          void audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
                        }
                      }}
                      className="lt-press inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1.5 text-[11px] font-bold text-amber-200 ring-1 ring-amber-400/30"
                    >
                      <Sparkles className="h-3 w-3" />
                      +4s Audio (-50 pts)
                    </button>
                  )}

                  {cellHintLevel < (activeCell.kind === 'riddle_trivia' ? 2 : 3) && (
                    <button
                      type="button"
                      onClick={() => setCellHintLevel((h) => h + 1)}
                      className="lt-press inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-3 py-1.5 text-[11px] font-bold text-[#CCCCCC] hover:bg-white/[0.14]"
                    >
                      <HelpCircle className="h-3 w-3 text-[#3EA6FF]" />
                      {activeCell.kind === 'visual_crop' ? 'Unblur / Clue (-50 pts)' : 'Reveal Clue (-50 pts)'}
                    </button>
                  )}
                </div>
              )}

              {renderAnswerInput(
                activeCell.options,
                activeCell.correctAnswer,
                cellPicked,
                (opt) => submitJeopardyAnswer(opt, false),
                (val) => submitJeopardyAnswer(val, true),
                activeCell.aliases
              )}

              {cellPicked && (
                <div className="flex items-center justify-between border-t border-white/[0.08] pt-3">
                  <span className="text-[12px] font-bold text-white">
                    {cellPicked === activeCell.correctAnswer
                      ? `+${effectiveCellReward} pts!`
                      : `-${Math.round(activeCell.points / 2)} pts · Answer: ${activeCell.correctAnswer}`}
                  </span>
                  <button
                    type="button"
                    onClick={closeActiveCell}
                    className="lt-press rounded-full bg-[#FF0000] px-4 py-1.5 text-[12px] font-bold text-white"
                  >
                    Back to Board
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Heralen 4x4 Interactive Jeopardy Board */
            <div className="space-y-3.5">
              {/* Scoreboard Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <div
                    className={`rounded-xl px-3 py-1 text-[12px] font-black ${
                      !twoPlayer || activePlayer === 0
                        ? 'bg-[#FF0000]/25 text-white ring-1 ring-[#FF0000]/50'
                        : 'bg-white/[0.04] text-[#AAAAAA]'
                    }`}
                  >
                    {twoPlayer ? 'P1' : 'Score'}: {playerScores[0]}
                  </div>
                  {twoPlayer && (
                    <div
                      className={`rounded-xl px-3 py-1 text-[12px] font-black ${
                        activePlayer === 1
                          ? 'bg-[#3EA6FF]/25 text-white ring-1 ring-[#3EA6FF]/50'
                          : 'bg-white/[0.04] text-[#AAAAAA]'
                      }`}
                    >
                      P2: {playerScores[1]}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#AAAAAA]">
                    {Object.keys(solvedCells).length}/{totalBoardCells} played
                  </span>
                  <button
                    type="button"
                    onClick={restartJeopardy}
                    className="lt-press inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/[0.16]"
                  >
                    <RotateCcw className="h-3 w-3" />
                    New Board
                  </button>
                </div>
              </div>

              {boardComplete ? (
                <div className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-6 text-center">
                  <Trophy className="mx-auto h-10 w-10 text-amber-300" />
                  <p className="text-[18px] font-black text-white">
                    {twoPlayer
                      ? playerScores[0] === playerScores[1]
                        ? 'Tie Game!'
                        : playerScores[0] > playerScores[1]
                          ? `Player 1 Wins (${playerScores[0]} pts)!`
                          : `Player 2 Wins (${playerScores[1]} pts)!`
                      : `Board Cleared · ${playerScores[0]} pts`}
                  </p>
                  <button
                    type="button"
                    onClick={restartJeopardy}
                    className="lt-press rounded-full bg-white px-5 py-2 text-[12.5px] font-bold text-black"
                  >
                    Generate Fresh Board
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {boardCategories.map((cat) => (
                    <div key={cat.id} className="space-y-2">
                      <div className="flex min-h-[54px] flex-col items-center justify-center rounded-xl border border-white/[0.12] bg-gradient-to-b from-blue-950/90 to-slate-900/95 px-1.5 py-2 text-center">
                        <p className="text-[11px] font-black leading-tight text-white">
                          {cat.title}
                        </p>
                        <p className="mt-0.5 text-[9.5px] font-semibold text-[#3EA6FF]">
                          {cat.subtitle}
                        </p>
                      </div>

                      {cat.cells.map((cell) => {
                        const status = solvedCells[cell.id];
                        return (
                          <button
                            key={cell.id}
                            type="button"
                            disabled={Boolean(status)}
                            onClick={() => openCell(cell)}
                            className={`lt-press flex h-14 w-full items-center justify-center rounded-xl border text-[15px] font-black transition ${
                              status === 'right'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400/70'
                                : status === 'wrong'
                                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-400/70'
                                  : 'border-amber-400/25 bg-gradient-to-b from-[#172554]/80 to-[#0f172a]/90 text-amber-300 shadow-md hover:border-amber-300/60 hover:brightness-125'
                            }`}
                          >
                            {status === 'right' ? (
                              <Check className="h-5 w-5" />
                            ) : status === 'wrong' ? (
                              <X className="h-5 w-5" />
                            ) : (
                              cell.points
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
