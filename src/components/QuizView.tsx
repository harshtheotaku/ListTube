import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  HelpCircle,
  Keyboard,
  ListChecks,
  Loader2,
  Pause,
  Play,
  Quote,
  RotateCcw,
  ShieldCheck,
  Split,
  Star,
  Trash2,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { Anime, LibraryState, MediaType } from '../types';
import { animeStore } from '../services/animeStore';
import { triggerHaptic } from '../services/haptics';
import {
  buildJeopardyBoard,
  buildNextInfiniteQuestion,
  DIFFICULTY_META,
  discoverDynamicAnimeTheme,
  doesTypedGuessMatch,
  getJeopardyHighScore,
  getQuizHighScore,
  getSeenQuizCount,
  InfiniteQuizQuestion,
  JeopardyCategory,
  JeopardyCell,
  JeopardyCellKind,
  markQuizQuestionSeen,
  QuizDifficultyLevel,
  resetSeenQuizHistory,
  resolveThemePreviewAudio,
  saveJeopardyHighScore,
  saveQuizHighScore,
  SNIPPET_LADDER,
  SNIPPET_LADDER_BY_DIFFICULTY,
  ThemeAudioTrack,
} from '../services/themeQuiz';
import { toast } from './Toast';

interface QuizViewProps {
  libraryState: LibraryState;
  mediaType: MediaType;
  onExplore?: () => void;
  onOpenAnime?: (anime: Anime) => void;
}

type QuizPageMode = 'infinite_3s' | 'jeopardy';

const DIFFICULTY_STYLES: Record<
  QuizDifficultyLevel,
  {
    label: string;
    Icon: React.ElementType;
    pillClass: string;
    iconClass: string;
  }
> = {
  easy: {
    label: 'Easy',
    Icon: ShieldCheck,
    pillClass: 'bg-white/[0.06] text-[#E5E5EA] ring-1 ring-white/[0.1]',
    iconClass: 'text-[#AEAEB2]',
  },
  medium: {
    label: 'Medium',
    Icon: Zap,
    pillClass: 'bg-white/[0.08] text-white ring-1 ring-white/[0.14]',
    iconClass: 'text-[#D1D1D6]',
  },
  hard: {
    label: 'Hard',
    Icon: Flame,
    pillClass: 'bg-white/[0.12] text-white ring-1 ring-white/[0.22]',
    iconClass: 'text-white',
  },
};

const DifficultyBadge: React.FC<{ difficulty: QuizDifficultyLevel }> = ({ difficulty }) => {
  const meta = DIFFICULTY_STYLES[difficulty];
  const Icon = meta.Icon;
  return (
    <span
      data-quiz-difficulty={difficulty}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-tight ${meta.pillClass}`}
    >
      <Icon className={`h-3 w-3 ${meta.iconClass}`} />
      <span>{meta.label}</span>
    </span>
  );
};

const KIND_LABELS: Record<JeopardyCellKind, string> = {
  audio: 'OP/ED Audio',
  visual_crop: 'Blurred Frame',
  riddle_trivia: '3-Clue Lore',
  studio_year: 'Studio & Year',
  emoji_plot: 'Symbol Plot',
  quote_match: 'Quote',
  odd_one_out: 'Odd One Out',
  stat_clash: 'Stat Clash',
  noob_plot: 'Plot Summary',
  cursed_review: '1-Star Review',
  lore_torture: 'Spot the Lie',
};

function fmtSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function findAnimeByTitle(title: string): Anime | undefined {
  const low = title.trim().toLowerCase();
  return animeStore
    .all()
    .find((a) => (a.mediaType ?? 'ANIME') === 'ANIME' && a.title.toLowerCase() === low);
}

export const QuizView: React.FC<QuizViewProps> = ({
  libraryState,
  onOpenAnime,
}) => {
  const [pageMode, setPageMode] = useState<QuizPageMode>('infinite_3s');
  const [typeAnswerMode, setTypeAnswerMode] = useState(false);
  const [typedGuess, setTypedGuess] = useState('');
  const [blindMode, setBlindMode] = useState(true);
  const [seenCount, setSeenCount] = useState(() => getSeenQuizCount());

  // Random Quiz state (always 'all' pool, randomized Easy/Medium/Hard per question)
  const sessionSeenRef = useRef<Set<string>>(new Set());
  const [questionNum, setQuestionNum] = useState(1);
  const [currentQ, setCurrentQ] = useState<InfiniteQuizQuestion>(() =>
    buildNextInfiniteQuestion({
      scope: 'all',
      entries: libraryState.entries,
      mediaType: 'ANIME',
    })
  );
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [snippetStep, setSnippetStep] = useState(0);
  const [hintStep, setHintStep] = useState(0);
  const [eliminatedOptions, setEliminatedOptions] = useState<string[]>([]);
  const [bestScore, setBestScore] = useState(() => getQuizHighScore());

  // Anime Jeopardy state
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

  // Audio player state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<ThemeAudioTrack | null>(null);
  const [resolvedSongMeta, setResolvedSongMeta] = useState<{
    songTitle: string;
    artist: string;
  } | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState({ cur: 0, dur: 30 });

  const boardCategories: JeopardyCategory[] = useMemo(
    () => buildJeopardyBoard(),
    [boardSeed]
  );
  const totalBoardCells = useMemo(
    () => boardCategories.reduce((sum, c) => sum + c.cells.length, 0),
    [boardCategories]
  );
  const boardComplete =
    Object.keys(solvedCells).length >= totalBoardCells && totalBoardCells > 0;

  const loadNextRandomQuestion = () => {
    const q = buildNextInfiniteQuestion({
      scope: 'all',
      entries: libraryState.entries,
      mediaType: 'ANIME',
      sessionExclude: sessionSeenRef.current,
    });
    sessionSeenRef.current.add(q.signature);
    setCurrentQ(q);
    setPicked(null);
    setTypedGuess('');
    setSnippetStep(0);
    setHintStep(0);
    setEliminatedOptions([]);
    setResolvedSongMeta(null);
  };

  const activeAudioTarget = useMemo(() => {
    if (pageMode === 'infinite_3s' && currentQ.kind === 'audio') {
      const ladder =
        SNIPPET_LADDER_BY_DIFFICULTY[currentQ.difficulty] ?? SNIPPET_LADDER_BY_DIFFICULTY.all;
      const maxClip = picked ? 30 : ladder[Math.min(snippetStep, ladder.length - 1)] ?? 30;
      return {
        id: currentQ.id,
        malId: currentQ.malId,
        audioQuery: currentQ.audioQuery,
        songTitle: currentQ.songTitle,
        artist: currentQ.artist,
        maxClipSec: maxClip,
      };
    }
    if (pageMode === 'jeopardy' && activeCell?.kind === 'audio') {
      const jpLadder = SNIPPET_LADDER.three_sec;
      const maxClip = cellPicked ? 30 : jpLadder[Math.min(cellClipBoost, jpLadder.length - 1)] ?? 30;
      return {
        id: activeCell.id,
        malId: undefined,
        audioQuery: activeCell.audioQuery,
        songTitle: activeCell.songTitle,
        artist: activeCell.artist,
        maxClipSec: maxClip,
      };
    }
    return null;
  }, [pageMode, currentQ, snippetStep, picked, activeCell, cellClipBoost, cellPicked]);

  useEffect(() => {
    if (!activeAudioTarget) {
      audioRef.current?.pause();
      setPlaying(false);
      setTrack(null);
      return;
    }
    let cancelled = false;
    setAudioLoading(true);
    setTrack(null);
    setResolvedSongMeta(null);
    setPlaying(false);
    setProgress({ cur: 0, dur: 30 });
    audioRef.current?.pause();

    const resolve = async () => {
      let querySpec = {
        id: activeAudioTarget.id,
        audioQuery: activeAudioTarget.audioQuery,
        songTitle: activeAudioTarget.songTitle,
        artist: activeAudioTarget.artist,
      };
      if (!querySpec.audioQuery && !querySpec.songTitle && activeAudioTarget.malId) {
        const discovered = await discoverDynamicAnimeTheme(activeAudioTarget.malId);
        if (cancelled) return;
        if (discovered) {
          querySpec = { id: activeAudioTarget.id, ...discovered };
          setResolvedSongMeta({
            songTitle: discovered.songTitle,
            artist: discovered.artist,
          });
        }
      }
      const res = await resolveThemePreviewAudio(querySpec);
      if (!cancelled) setTrack(res);
    };

    void resolve().finally(() => {
      if (!cancelled) setAudioLoading(false);
    });

    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
  }, [activeAudioTarget?.id]);

  useEffect(() => {
    if (!track?.previewUrl || !audioRef.current) return;
    const el = audioRef.current;
    el.muted = muted;
    el.currentTime = 0;
    void el
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  }, [track?.previewUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  // Frame-accurate clip stop (ensures exact 1s -> 3s -> 10s stops without waiting on coarse timeupdate ticks)
  useEffect(() => {
    if (!playing || !activeAudioTarget || activeAudioTarget.maxClipSec >= 30) return;
    const cap = activeAudioTarget.maxClipSec;
    const id = window.setInterval(() => {
      const el = audioRef.current;
      if (!el || el.paused) return;
      if (el.currentTime >= cap) {
        el.pause();
        el.currentTime = cap;
        setPlaying(false);
        setProgress({ cur: cap, dur: el.duration || 30 });
      }
    }, 35);
    return () => window.clearInterval(id);
  }, [playing, activeAudioTarget?.id, activeAudioTarget?.maxClipSec]);

  // Desktop keyboard controls: Space Play/Pause, 1-4 Choices, 5 Fifty-Fifty, H Clue, N/Enter Next
  useEffect(() => {
    const onQuizKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      if (e.key === ' ') {
        e.preventDefault();
        void togglePlay();
        return;
      }

      if (pageMode === 'infinite_3s') {
        if (!picked && !typeAnswerMode && ['1', '2', '3', '4'].includes(e.key)) {
          const opt = currentQ.options[Number(e.key) - 1];
          if (opt && !eliminatedOptions.includes(opt)) {
            e.preventDefault();
            submitRandomAnswer(opt, false);
          }
          return;
        }
        if (!picked && e.key === '5' && !typeAnswerMode && eliminatedOptions.length === 0) {
          e.preventDefault();
          triggerFiftyFifty();
          return;
        }
        if (!picked && e.key.toLowerCase() === 'h' && currentQ.clues.length > hintStep) {
          e.preventDefault();
          setHintStep((h) => h + 1);
          return;
        }
        if (picked && (e.key.toLowerCase() === 'n' || e.key === 'Enter')) {
          e.preventDefault();
          advanceNextQuestion();
        }
      } else if (activeCell) {
        if (!cellPicked && !typeAnswerMode && ['1', '2', '3', '4'].includes(e.key)) {
          const opt = activeCell.options[Number(e.key) - 1];
          if (opt) {
            e.preventDefault();
            submitJeopardyAnswer(opt, false);
          }
          return;
        }
        if (cellPicked && (e.key.toLowerCase() === 'n' || e.key === 'Escape')) {
          e.preventDefault();
          closeActiveCell();
        }
      }
    };
    window.addEventListener('keydown', onQuizKey);
    return () => window.removeEventListener('keydown', onQuizKey);
  });

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

  // --- Random Quiz Scoring (includes Negative Points on wrong picks) ---
  const activeLadder =
    SNIPPET_LADDER_BY_DIFFICULTY[currentQ.difficulty] ?? SNIPPET_LADDER_BY_DIFFICULTY.all;
  const diffMultiplier = DIFFICULTY_META[currentQ.difficulty].multiplier;
  const basePoints = Math.max(
    40,
    240 - snippetStep * 45 - hintStep * 35 - (eliminatedOptions.length > 0 ? 50 : 0) + streak * 25
  );
  const potentialPoints = Math.round(basePoints * diffMultiplier);
  const wrongPenalty = Math.round(60 * diffMultiplier);

  const triggerFiftyFifty = () => {
    if (picked || eliminatedOptions.length > 0) return;
    const wrong = currentQ.options.filter((o) => o !== currentQ.correctAnswer);
    const toRemove = wrong.sort(() => Math.random() - 0.5).slice(0, 2);
    triggerHaptic('light');
    setEliminatedOptions(toRemove);
  };

  const submitRandomAnswer = (guess: string, isTyped = false) => {
    if (picked) return;
    const isCorrect = isTyped
      ? doesTypedGuessMatch(guess, currentQ.correctAnswer, currentQ.aliases)
      : guess === currentQ.correctAnswer;

    markQuizQuestionSeen(currentQ.signature);
    sessionSeenRef.current.add(currentQ.signature);
    setSeenCount(getSeenQuizCount());
    setPicked(isCorrect ? currentQ.correctAnswer : guess);

    if (isCorrect) {
      triggerHaptic('success');
      const nextScore = score + potentialPoints;
      setScore(nextScore);
      setStreak((s) => s + 1);
      if (nextScore > bestScore) {
        setBestScore(nextScore);
        saveQuizHighScore(nextScore);
      }
    } else {
      triggerHaptic('medium');
      setScore((s) => s - wrongPenalty);
      setStreak(0);
    }
  };

  const advanceNextQuestion = () => {
    triggerHaptic('light');
    audioRef.current?.pause();
    setPlaying(false);
    setQuestionNum((n) => n + 1);
    loadNextRandomQuestion();
  };

  // Keyboard shortcuts (1-4 to pick choice, Enter to advance) for fast Apple-grade desktop UX
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (typeAnswerMode) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (pageMode === 'infinite_3s') {
        if (!picked && ['1', '2', '3', '4'].includes(e.key)) {
          const opt = currentQ.options[Number(e.key) - 1];
          if (opt && !eliminatedOptions.includes(opt)) {
            e.preventDefault();
            submitRandomAnswer(opt, false);
          }
        } else if (picked && (e.key === 'Enter' || e.key === 'ArrowRight')) {
          e.preventDefault();
          advanceNextQuestion();
        }
      } else if (activeCell) {
        if (!cellPicked && ['1', '2', '3', '4'].includes(e.key)) {
          const opt = activeCell.options[Number(e.key) - 1];
          if (opt) {
            e.preventDefault();
            submitJeopardyAnswer(opt, false);
          }
        } else if (cellPicked && e.key === 'Enter') {
          e.preventDefault();
          closeActiveCell();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // --- Jeopardy Handlers ---
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
    const delta = isCorrect ? effectiveCellReward : -Math.round(activeCell.points / 2);
    const nextScores: [number, number] = [...playerScores] as [number, number];
    nextScores[activePlayer] = nextScores[activePlayer] + delta;
    setPlayerScores(nextScores);
    setSolvedCells((prev) => ({
      ...prev,
      [activeCell.id]: isCorrect ? 'right' : 'wrong',
    }));

    if (isCorrect) {
      triggerHaptic('success');
      const high = Math.max(nextScores[0], twoPlayer ? nextScores[1] : nextScores[0]);
      if (high > bestJeopardy) {
        setBestJeopardy(high);
        saveJeopardyHighScore(high);
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
      <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-4">
        <div className="flex items-center justify-between text-[11px] font-medium text-[#8E8E93]">
          <span className="flex items-center gap-2">
            {label}
            {playing && (
              <span className="inline-flex h-3 items-end gap-[2px]" aria-hidden="true">
                <span className="lt-audio-bar h-full w-[2px] rounded-full bg-white" />
                <span
                  className="lt-audio-bar h-full w-[2px] rounded-full bg-white/80"
                  style={{ animationDelay: '160ms' }}
                />
                <span
                  className="lt-audio-bar h-full w-[2px] rounded-full bg-white/60"
                  style={{ animationDelay: '320ms' }}
                />
              </span>
            )}
          </span>
          <span className="rounded-full bg-white/[0.08] px-2.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-[#E5E5EA]">
            {cap < 30 ? `${cap}s clip` : '30s preview'}
          </span>
        </div>

        <div className="flex items-center gap-3.5">
          <button
            type="button"
            disabled={audioLoading || !track?.previewUrl}
            onClick={() => void togglePlay()}
            aria-label={playing ? 'Pause theme song' : 'Play theme song'}
            className="lt-btn-apple flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-black disabled:opacity-40"
          >
            {audioLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : playing ? (
              <Pause className="h-5 w-5 fill-current" />
            ) : (
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            )}
          </button>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[13.5px] font-semibold tracking-tight text-white">
                {titleText}
              </p>
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                className="lt-press rounded-full p-1.5 text-[#8E8E93] hover:bg-white/[0.08] hover:text-white"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
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
              className="relative h-1.5 cursor-pointer overflow-hidden rounded-full bg-white/[0.1]"
            >
              <div
                className="absolute inset-y-0 left-0 bg-white/[0.16]"
                style={{ width: `${capPct}%` }}
              />
              <div
                className="relative z-10 h-full rounded-full bg-white transition-all duration-100"
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] tabular-nums text-[#8E8E93]">
              <span>{fmtSec(progress.cur)}</span>
              <span>
                {audioLoading
                  ? 'Loading audio…'
                  : track?.previewUrl
                    ? `Up to ${cap}s`
                    : 'Audio unavailable — use clues'}
              </span>
              <span>{fmtSec(cap)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderBigAnswerGrid = (
    options: string[],
    correctAnswer: string,
    selected: string | null,
    onSelectChoice: (opt: string) => void,
    onSubmitTyped: (val: string) => void,
    aliases?: string[],
    eliminated: string[] = []
  ) => {
    const isAnswered = selected !== null;
    if (typeAnswerMode && !isAnswered) {
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (typedGuess.trim()) onSubmitTyped(typedGuess.trim());
          }}
          className="flex flex-col gap-2.5 sm:flex-row"
        >
          <input
            type="text"
            value={typedGuess}
            onChange={(e) => setTypedGuess(e.target.value)}
            placeholder="Type anime title…"
            autoFocus
            className="h-13 flex-1 rounded-2xl border border-white/[0.12] bg-[#1C1C1E] px-4 text-[14.5px] font-medium text-white placeholder:text-[#636366] outline-none transition focus:border-white/40"
          />
          <button
            type="submit"
            disabled={!typedGuess.trim()}
            className="lt-btn-apple h-13 rounded-2xl bg-white px-6 text-[14px] font-semibold text-black disabled:opacity-35"
          >
            Submit
          </button>
        </form>
      );
    }

    if (typeAnswerMode && isAnswered) {
      const won =
        selected === correctAnswer ||
        doesTypedGuessMatch(selected ?? '', correctAnswer, aliases);
      return (
        <div
          className={`rounded-2xl border p-4 text-[14px] font-semibold ${
            won
              ? 'lt-answer-pulse border-emerald-400/40 bg-emerald-500/12 text-emerald-200'
              : 'lt-answer-shake border-rose-400/40 bg-rose-500/12 text-rose-200'
          }`}
        >
          {won ? 'Correct' : `Guessed "${selected}"`} · {correctAnswer}
        </div>
      );
    }

    const LETTERS = ['A', 'B', 'C', 'D'];
    const STAGGERS = ['lt-stagger-1', 'lt-stagger-2', 'lt-stagger-3', 'lt-stagger-4'];
    return (
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {options.map((opt, idxOpt) => {
          const isCorrect = opt === correctAnswer;
          const isPicked = selected === opt;
          const isRemoved = !isAnswered && eliminated.includes(opt);
          let cls =
            'border-white/[0.09] bg-[#1C1C1E] text-[#F2F2F7] hover:border-white/[0.22] hover:bg-[#262629]';
          let feedbackAnim = '';
          if (isRemoved) {
            cls = 'border-white/[0.04] bg-[#161618] text-[#48484A] line-through opacity-40';
          } else if (isAnswered) {
            if (isCorrect) {
              cls = 'border-emerald-400/55 bg-emerald-500/14 text-white';
              feedbackAnim = 'lt-answer-pulse';
            } else if (isPicked) {
              cls = 'border-rose-400/55 bg-rose-500/14 text-white';
              feedbackAnim = 'lt-answer-shake';
            } else {
              cls = 'border-white/[0.05] bg-[#161618] text-[#636366] opacity-70';
            }
          }
          return (
            <button
              key={opt}
              type="button"
              disabled={isAnswered || isRemoved}
              onClick={() => onSelectChoice(opt)}
              className={`lt-btn-apple lt-card-pop ${STAGGERS[idxOpt] ?? ''} ${feedbackAnim} flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left text-[14px] font-semibold leading-snug tracking-tight sm:min-h-[62px] sm:px-4 sm:text-[14.5px] ${cls}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11.5px] font-bold transition-colors ${
                    isAnswered && isCorrect
                      ? 'bg-emerald-400 text-black'
                      : isAnswered && isPicked
                        ? 'bg-rose-400 text-black'
                        : 'bg-white/[0.07] text-[#8E8E93]'
                  }`}
                >
                  {LETTERS[idxOpt] ?? idxOpt + 1}
                </span>
                <span className="line-clamp-2">{opt}</span>
              </div>
              {isAnswered && isCorrect && (
                <Check className="h-4.5 w-4.5 shrink-0 text-emerald-400" />
              )}
              {isAnswered && isPicked && !isCorrect && (
                <X className="h-4.5 w-4.5 shrink-0 text-rose-400" />
              )}
            </button>
          );
        })}
      </div>
    );
  };

  const renderTrackShortcutButton = (title: string) => {
    if (!onOpenAnime) return null;
    const match = findAnimeByTitle(title);
    if (!match) return null;
    return (
      <button
        type="button"
        onClick={() => onOpenAnime(match)}
        className="lt-btn-apple inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.06] px-3 py-1.5 text-[11.5px] font-semibold text-[#E5E5EA] hover:bg-white/[0.12] hover:text-white"
      >
        <ExternalLink className="h-3 w-3" />
        <span>{match.title}</span>
      </button>
    );
  };

  const songDisplayTitle = resolvedSongMeta?.songTitle ?? currentQ.songTitle ?? 'Anime Theme';
  const songDisplayArtist = resolvedSongMeta?.artist ?? currentQ.artist ?? 'Studio Track';
  const blurScaleClasses = (diff: QuizDifficultyLevel, step: number, done: boolean) => {
    if (done) return 'scale-100 blur-0';
    if (diff === 'easy') {
      return step === 0 ? 'scale-[1.7] blur-[10px]' : step === 1 ? 'scale-[1.3] blur-[4px]' : 'scale-105 blur-[1px]';
    }
    if (diff === 'hard') {
      return step === 0 ? 'scale-[2.7] blur-[18px]' : step === 1 ? 'scale-[1.9] blur-[9px]' : 'scale-[1.25] blur-[3px]';
    }
    return step === 0 ? 'scale-[2.3] blur-[14px]' : step === 1 ? 'scale-[1.6] blur-[6px]' : 'scale-110 blur-[2px]';
  };

  const activeScoreVal = pageMode === 'jeopardy' ? playerScores[0] : score;

  return (
    <div
      role="region"
      aria-label="OP and ED Music Quiz"
      className="flex min-h-[calc(100dvh-56px)] w-full max-w-none flex-col justify-start gap-2.5 bg-[#0F0F0F] px-0 pb-28 pt-2.5 text-white sm:gap-3.5 sm:px-4 lg:justify-center lg:gap-4 lg:px-6 lg:pb-10 lg:pt-4"
    >
      {/* Apple-Minimal Top Bar: Segmented Mode Switch + Compact Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-0">
        <div className="inline-flex rounded-full border border-white/[0.08] bg-[#161618] p-1">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              audioRef.current?.pause();
              setPlaying(false);
              setPageMode('infinite_3s');
            }}
            className={`lt-press rounded-full px-4 py-1.5 text-[12.5px] font-semibold tracking-tight transition-all ${
              pageMode === 'infinite_3s'
                ? 'bg-white text-black shadow-sm'
                : 'text-[#8E8E93] hover:text-white'
            }`}
          >
            Random Quiz
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              audioRef.current?.pause();
              setPlaying(false);
              setPageMode('jeopardy');
            }}
            className={`lt-press rounded-full px-4 py-1.5 text-[12.5px] font-semibold tracking-tight transition-all ${
              pageMode === 'jeopardy'
                ? 'bg-white text-black shadow-sm'
                : 'text-[#8E8E93] hover:text-white'
            }`}
          >
            Anime Jeopardy
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {pageMode === 'jeopardy' && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setTwoPlayer((v) => !v);
                setActivePlayer(0);
              }}
              className={`lt-press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-semibold ${
                twoPlayer
                  ? 'border-white/25 bg-white text-black'
                  : 'border-white/[0.08] bg-[#161618] text-[#AEAEB2] hover:text-white'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>{twoPlayer ? '2P' : '1P'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setTypeAnswerMode((v) => !v);
            }}
            aria-label={typeAnswerMode ? 'Switch to multiple choice' : 'Switch to type answer'}
            className={`lt-press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-semibold ${
              typeAnswerMode
                ? 'border-white/25 bg-white text-black'
                : 'border-white/[0.08] bg-[#161618] text-[#AEAEB2] hover:text-white'
            }`}
          >
            {typeAnswerMode ? <Keyboard className="h-3.5 w-3.5" /> : <ListChecks className="h-3.5 w-3.5" />}
            <span>{typeAnswerMode ? 'Type' : 'Choices'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setBlindMode((v) => !v);
            }}
            aria-label={blindMode ? 'Disable blind mode' : 'Enable blind mode'}
            className={`lt-press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-semibold ${
              blindMode
                ? 'border-white/[0.16] bg-white/[0.12] text-white'
                : 'border-white/[0.08] bg-[#161618] text-[#AEAEB2] hover:text-white'
            }`}
          >
            {blindMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span>{blindMode ? 'Blind' : 'Title'}</span>
          </button>

          {seenCount > 0 && pageMode === 'infinite_3s' && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                resetSeenQuizHistory();
                sessionSeenRef.current.clear();
                setSeenCount(0);
                toast('Question history cleared');
              }}
              aria-label="Reset question history"
              title="Reset seen history"
              className="lt-press inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-[#161618] text-[#8E8E93] hover:text-white"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Compact Single-Row Apple Score Strip */}
      <div
        aria-label="Quiz Points Scoreboard"
        className="flex flex-wrap items-center justify-between gap-2 rounded-none border-y border-white/[0.08] bg-[#161618] px-3.5 py-2.5 sm:rounded-2xl sm:border-x sm:px-4"
      >
        <div className="flex items-center gap-5 sm:gap-7">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-medium text-[#8E8E93]">Score</span>
            <span
              className={`text-[18px] font-bold tracking-tight tabular-nums ${
                activeScoreVal < 0 ? 'text-rose-400' : 'text-white'
              }`}
            >
              {activeScoreVal}
            </span>
          </div>

          <div className="h-3.5 w-px bg-white/[0.08]" aria-hidden="true" />

          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-medium text-[#8E8E93]">
              {pageMode === 'jeopardy' ? 'Cleared' : 'Streak'}
            </span>
            <span className="text-[16px] font-semibold tracking-tight tabular-nums text-[#E5E5EA]">
              {pageMode === 'jeopardy'
                ? `${Object.keys(solvedCells).length}/${totalBoardCells}`
                : streak}
            </span>
          </div>

          <div className="h-3.5 w-px bg-white/[0.08]" aria-hidden="true" />

          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-medium text-[#8E8E93]">Best</span>
            <span className="text-[16px] font-semibold tracking-tight tabular-nums text-[#E5E5EA]">
              {pageMode === 'jeopardy' ? bestJeopardy : bestScore}
            </span>
          </div>
        </div>

        {pageMode === 'infinite_3s' && (
          <div className="flex items-center gap-2 text-[11.5px] font-semibold tabular-nums">
            <span className="rounded-full bg-white/[0.08] px-2.5 py-0.5 text-white">
              +{potentialPoints} PTS
            </span>
            <span className="rounded-full bg-white/[0.05] px-2.5 py-0.5 text-[#8E8E93]">
              -{wrongPenalty} Wrong
            </span>
          </div>
        )}
      </div>

      {/* Shared In-App Audio Element */}
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

      {pageMode === 'infinite_3s' ? (
        <div
          key={currentQ.id}
          className="lt-view-enter rounded-none border-y border-white/[0.08] bg-[#161618] px-3.5 py-4 sm:rounded-3xl sm:border-x sm:p-6"
        >
          {/* Minimal Question Meta Row */}
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold tabular-nums text-[#8E8E93]">
                #{questionNum}
              </span>
              <DifficultyBadge difficulty={currentQ.difficulty} />
              <span className="text-[12px] font-medium text-[#8E8E93]">
                {KIND_LABELS[currentQ.kind]}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
            {/* Left Column: Focused Media / Prompt Card + Minimal Lifelines */}
            <div className="space-y-3 lg:col-span-5">
              {currentQ.kind === 'audio' &&
                renderAudioCard(
                  `${DIFFICULTY_META[currentQ.difficulty].starterSec}s Starter`,
                  blindMode && !picked
                    ? 'Mystery Theme'
                    : `${songDisplayTitle} · ${songDisplayArtist}`
                )}

              {currentQ.kind === 'visual_crop' && currentQ.imageUrl && (
                <div className="relative mx-auto aspect-video w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-black">
                  <img
                    src={currentQ.imageUrl}
                    alt="Blurred frame challenge"
                    className={`h-full w-full object-cover transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${blurScaleClasses(
                      currentQ.difficulty,
                      hintStep,
                      Boolean(picked)
                    )}`}
                  />
                  {!picked && (
                    <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/70 px-2.5 py-0.5 text-[10.5px] font-semibold text-white/90 backdrop-blur-md">
                      {hintStep === 0 ? 'Blurred' : hintStep === 1 ? 'Sharper' : 'Clear'}
                    </span>
                  )}
                </div>
              )}

              {currentQ.kind === 'emoji_plot' && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-6 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8E8E93]">
                    Symbol Clues
                  </p>
                  <p className="mt-2.5 text-[32px] tracking-widest sm:text-[36px]">
                    {currentQ.prompt.replace('Emoji Plot Decoder:', '').trim()}
                  </p>
                </div>
              )}

              {currentQ.kind === 'quote_match' && (
                <div className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-5">
                  <Quote className="mb-2 h-5 w-5 text-[#8E8E93]" />
                  <p className="text-[15px] font-medium leading-relaxed text-white">
                    {currentQ.prompt.replace('Iconic Quote:', '').trim()}
                  </p>
                </div>
              )}

              {currentQ.kind === 'noob_plot' && (
                <div className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8E8E93]">
                    Plot Summary
                  </p>
                  <p className="mt-2 text-[15px] font-medium leading-relaxed text-white">
                    {currentQ.prompt.replace('Anime Noob Explains:', '').trim()}
                  </p>
                </div>
              )}

              {currentQ.kind === 'cursed_review' && (
                <div className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8E8E93]">
                      1-Star Review
                    </span>
                    <span className="inline-flex items-center gap-0.5" aria-label="1 out of 5 stars">
                      {[0, 1, 2, 3, 4].map((idx) => (
                        <Star
                          key={idx}
                          className={`h-3.5 w-3.5 ${
                            idx === 0 ? 'fill-white text-white' : 'text-white/20'
                          }`}
                        />
                      ))}
                    </span>
                  </div>
                  <p className="mt-2.5 text-[14.5px] font-medium leading-relaxed text-white">
                    {currentQ.prompt.replace(/^★☆☆☆☆\s*—\s*/, '').trim()}
                  </p>
                </div>
              )}

              {currentQ.kind === 'lore_torture' && (
                <div className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8E8E93]">
                    Spot the Lie
                  </p>
                  <p className="mt-2 text-[14.5px] font-medium leading-relaxed text-[#E5E5EA]">
                    Three facts about <span className="font-semibold text-white">{currentQ.animeTitle}</span> are true. Pick the single fake one.
                  </p>
                </div>
              )}

              {!picked && (
                <div className="flex flex-wrap items-center gap-2">
                  {currentQ.kind === 'audio' && snippetStep < activeLadder.length - 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setSnippetStep((s) => Math.min(activeLadder.length - 1, s + 1));
                        if (audioRef.current && track?.previewUrl) {
                          audioRef.current.currentTime = 0;
                          void audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
                        }
                      }}
                      className="lt-btn-apple inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-[#1C1C1E] px-3.5 py-1.5 text-[12px] font-semibold text-[#E5E5EA] hover:bg-[#262629] hover:text-white"
                    >
                      <span>Extend {activeLadder[snippetStep + 1]}s</span>
                      <span className="text-[#8E8E93]">-45</span>
                    </button>
                  )}

                  {currentQ.clues.length > hintStep && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setHintStep((h) => h + 1);
                      }}
                      className="lt-btn-apple inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-[#1C1C1E] px-3.5 py-1.5 text-[12px] font-semibold text-[#E5E5EA] hover:bg-[#262629] hover:text-white"
                    >
                      <HelpCircle className="h-3.5 w-3.5 text-[#8E8E93]" />
                      <span>
                        {currentQ.kind === 'visual_crop'
                          ? `Unblur ${hintStep + 1}`
                          : `Clue ${hintStep + 1}`}
                      </span>
                      <span className="text-[#8E8E93]">-35</span>
                    </button>
                  )}

                  {!typeAnswerMode && eliminatedOptions.length === 0 && (
                    <button
                      type="button"
                      onClick={triggerFiftyFifty}
                      className="lt-btn-apple inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-[#1C1C1E] px-3.5 py-1.5 text-[12px] font-semibold text-[#E5E5EA] hover:bg-[#262629] hover:text-white"
                    >
                      <Split className="h-3.5 w-3.5 text-[#8E8E93]" />
                      <span>50/50</span>
                      <span className="text-[#8E8E93]">-50</span>
                    </button>
                  )}
                </div>
              )}

              {(hintStep > 0 || currentQ.kind === 'riddle_trivia') && (
                <div className="lt-card-pop space-y-1.5 rounded-2xl border border-white/[0.07] bg-[#1C1C1E]/80 p-3.5 text-[12.5px] leading-relaxed text-[#D1D1D6]">
                  {currentQ.clues
                    .slice(0, currentQ.kind === 'riddle_trivia' ? Math.max(1, hintStep + 1) : hintStep)
                    .map((c, ci) => (
                      <p key={ci}>
                        <span className="font-semibold text-white">Clue {ci + 1}:</span> {c}
                      </p>
                    ))}
                </div>
              )}
            </div>

            {/* Right Column: Prompt + Tactile Choices + Clean Result Bar */}
            <div className="space-y-4 lg:col-span-7">
              <h2 className="text-[17px] font-semibold leading-snug tracking-tight text-white sm:text-[20px]">
                {currentQ.kind === 'audio' && blindMode && !picked
                  ? `Which anime is this ${DIFFICULTY_META[currentQ.difficulty].starterSec}s theme from?`
                  : currentQ.kind === 'emoji_plot'
                    ? 'Which anime matches these symbols?'
                    : currentQ.kind === 'quote_match'
                      ? 'Which anime is this quote from?'
                      : currentQ.kind === 'noob_plot'
                        ? 'Which anime does this summary describe?'
                        : currentQ.kind === 'cursed_review'
                          ? 'Which anime received this review?'
                          : currentQ.prompt}
              </h2>

              {renderBigAnswerGrid(
                currentQ.options,
                currentQ.correctAnswer,
                picked,
                (opt) => submitRandomAnswer(opt, false),
                (val) => submitRandomAnswer(val, true),
                currentQ.aliases,
                eliminatedOptions
              )}

              {picked && (
                <div className="lt-card-pop flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className={`text-[13.5px] font-semibold ${
                        picked === currentQ.correctAnswer ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {picked === currentQ.correctAnswer
                        ? `+${potentialPoints} pts · ${currentQ.animeTitle}${currentQ.songTitle ? ` — ${currentQ.songTitle}` : ''}`
                        : `-${wrongPenalty} pts · ${currentQ.correctAnswer}`}
                    </span>
                    {renderTrackShortcutButton(currentQ.animeTitle)}
                  </div>
                  <button
                    type="button"
                    onClick={advanceNextQuestion}
                    className="lt-btn-apple inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-[13px] font-semibold text-black"
                  >
                    <span>Next</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeCell ? (
        <div
          key={activeCell.id}
          className="lt-view-enter space-y-4 rounded-none border-y border-white/[0.08] bg-[#161618] px-3.5 py-4 sm:rounded-3xl sm:border-x sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={closeActiveCell}
              className="lt-btn-apple inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-[#1C1C1E] px-3.5 py-1.5 text-[12px] font-semibold text-[#E5E5EA] hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Board</span>
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <DifficultyBadge difficulty={activeCell.difficulty} />
              {activeCell.isDailyDouble && (
                <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-black">
                  2× Double
                </span>
              )}
              <span className="rounded-full bg-white/[0.08] px-3 py-0.5 text-[12px] font-semibold tabular-nums text-white">
                +{effectiveCellReward} PTS
              </span>
            </div>
          </div>

          {activeCell.kind === 'audio' &&
            renderAudioCard(
              `OP/ED · ${activeCell.points} pts`,
              blindMode && !cellPicked
                ? 'Mystery Theme'
                : `${activeCell.songTitle} · ${activeCell.artist}`
            )}

          {activeCell.kind === 'visual_crop' && activeCell.imageUrl && (
            <div className="relative mx-auto aspect-video w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.08] bg-black">
              <img
                src={activeCell.imageUrl}
                alt="Blurred anime challenge"
                className={`h-full w-full object-cover transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${blurScaleClasses(
                  activeCell.difficulty,
                  cellHintLevel,
                  Boolean(cellPicked)
                )}`}
              />
            </div>
          )}

          <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-4">
            <p className="text-[16px] font-semibold tracking-tight text-white">{activeCell.prompt}</p>
            <div className="space-y-1.5 text-[13px] text-[#D1D1D6]">
              {(activeCell.kind === 'riddle_trivia'
                ? activeCell.clues.slice(0, cellHintLevel + 1)
                : activeCell.clues.slice(0, cellHintLevel)
              ).map((clue, ci) => (
                <p key={ci} className="rounded-xl bg-white/[0.04] px-3 py-1.5">
                  {clue}
                </p>
              ))}
            </div>
          </div>

          {!cellPicked && (
            <div className="flex flex-wrap items-center gap-2">
              {activeCell.kind === 'audio' &&
                cellClipBoost < SNIPPET_LADDER.three_sec.length - 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setCellClipBoost((b) => b + 1);
                      if (audioRef.current && track?.previewUrl) {
                        audioRef.current.currentTime = 0;
                        void audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
                      }
                    }}
                    className="lt-btn-apple inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-[#1C1C1E] px-3.5 py-1.5 text-[12px] font-semibold text-[#E5E5EA]"
                  >
                    <span>Extend {SNIPPET_LADDER.three_sec[cellClipBoost + 1]}s</span>
                    <span className="text-[#8E8E93]">-50</span>
                  </button>
                )}

              {cellHintLevel < (activeCell.kind === 'riddle_trivia' ? 2 : 3) && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setCellHintLevel((h) => h + 1);
                  }}
                  className="lt-btn-apple inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-[#1C1C1E] px-3.5 py-1.5 text-[12px] font-semibold text-[#E5E5EA]"
                >
                  <HelpCircle className="h-3.5 w-3.5 text-[#8E8E93]" />
                  <span>{activeCell.kind === 'visual_crop' ? 'Unblur' : 'Clue'}</span>
                  <span className="text-[#8E8E93]">-50</span>
                </button>
              )}
            </div>
          )}

          {renderBigAnswerGrid(
            activeCell.options,
            activeCell.correctAnswer,
            cellPicked,
            (opt) => submitJeopardyAnswer(opt, false),
            (val) => submitJeopardyAnswer(val, true),
            activeCell.aliases
          )}

          {cellPicked && (
            <div className="lt-card-pop flex items-center justify-between border-t border-white/[0.08] pt-4">
              <span
                className={`text-[13.5px] font-semibold ${
                  cellPicked === activeCell.correctAnswer ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {cellPicked === activeCell.correctAnswer
                  ? `+${effectiveCellReward} pts`
                  : `-${Math.round(activeCell.points / 2)} pts · ${activeCell.correctAnswer}`}
              </span>
              <button
                type="button"
                onClick={closeActiveCell}
                className="lt-btn-apple rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-black"
              >
                Back to Board
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          key="jeopardy-board"
          className="lt-view-enter space-y-3.5 rounded-none border-y border-white/[0.08] bg-[#161618] px-3 py-4 sm:rounded-3xl sm:border-x sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {twoPlayer && (
                <>
                  <div
                    className={`rounded-full px-3.5 py-1 text-[12px] font-semibold tabular-nums transition ${
                      activePlayer === 0
                        ? 'bg-white text-black'
                        : 'bg-[#1C1C1E] text-[#8E8E93]'
                    }`}
                  >
                    P1 · {playerScores[0]}
                  </div>
                  <div
                    className={`rounded-full px-3.5 py-1 text-[12px] font-semibold tabular-nums transition ${
                      activePlayer === 1
                        ? 'bg-white text-black'
                        : 'bg-[#1C1C1E] text-[#8E8E93]'
                    }`}
                  >
                    P2 · {playerScores[1]}
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={restartJeopardy}
              className="lt-btn-apple inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-[#1C1C1E] px-3.5 py-1.5 text-[12px] font-semibold text-[#E5E5EA] hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>New Board</span>
            </button>
          </div>

          {boardComplete ? (
            <div className="space-y-3 rounded-2xl border border-white/[0.1] bg-[#1C1C1E] p-8 text-center">
              <Trophy className="mx-auto h-10 w-10 text-white" />
              <p className="text-[19px] font-bold tracking-tight text-white">
                {twoPlayer
                  ? playerScores[0] === playerScores[1]
                    ? 'Tie Game'
                    : playerScores[0] > playerScores[1]
                      ? `Player 1 Wins · ${playerScores[0]} pts`
                      : `Player 2 Wins · ${playerScores[1]} pts`
                  : `Board Cleared · ${playerScores[0]} pts`}
              </p>
              <button
                type="button"
                onClick={restartJeopardy}
                className="lt-btn-apple rounded-full bg-white px-6 py-2.5 text-[13px] font-semibold text-black"
              >
                New Board
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {boardCategories.map((cat) => (
                <div key={cat.id} className="space-y-2">
                  <div className="flex min-h-[52px] flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-[#1C1C1E] px-2 py-2 text-center">
                    <p className="text-[12.5px] font-semibold leading-tight tracking-tight text-white">
                      {cat.title}
                    </p>
                    <p className="mt-0.5 text-[10.5px] font-medium text-[#8E8E93]">
                      {cat.subtitle}
                    </p>
                  </div>

                  {cat.cells.map((cell) => {
                    const status = solvedCells[cell.id];
                    const diffStyle = DIFFICULTY_STYLES[cell.difficulty];
                    const DiffIcon = diffStyle.Icon;
                    return (
                      <button
                        key={cell.id}
                        type="button"
                        disabled={Boolean(status)}
                        onClick={() => openCell(cell)}
                        aria-label={`${cat.title} ${cell.points} points (${diffStyle.label})`}
                        className={`lt-btn-apple flex h-14 w-full items-center justify-center gap-1.5 rounded-2xl border text-[15px] font-bold tabular-nums ${
                          status === 'right'
                            ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-400/75'
                            : status === 'wrong'
                              ? 'border-rose-400/30 bg-rose-500/10 text-rose-400/75'
                              : 'border-white/[0.09] bg-[#1C1C1E] text-white hover:border-white/[0.22] hover:bg-[#262629]'
                        }`}
                      >
                        {status === 'right' ? (
                          <Check className="h-5 w-5" />
                        ) : status === 'wrong' ? (
                          <X className="h-5 w-5" />
                        ) : (
                          <>
                            <DiffIcon className="h-3.5 w-3.5 text-[#8E8E93]" />
                            <span>{cell.points}</span>
                          </>
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
  );
};
