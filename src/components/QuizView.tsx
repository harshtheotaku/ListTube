import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Award,
  Calendar,
  Check,
  Copy,
  Crown,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  Gamepad2,
  Grid,
  HelpCircle,
  Keyboard,
  ListChecks,
  Loader2,
  Music,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
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
  buildDailyTenRound,
  buildDuelMatchup,
  buildJeopardyBoard,
  buildNextInfiniteQuestion,
  DailyQuizResult,
  DIFFICULTY_META,
  discoverDynamicAnimeTheme,
  doesTypedGuessMatch,
  DuelMatchup,
  DuelMetric,
  getDailyQuizResult,
  getDuelHighStreak,
  getJeopardyHighScore,
  getQuizHighScore,
  getQuizRankInfo,
  getSeenQuizCount,
  getTodayDateKey,
  InfiniteQuizQuestion,
  JeopardyCategory,
  JeopardyCell,
  JeopardyCellKind,
  markQuizQuestionSeen,
  QuizDifficultyFilter,
  QuizDifficultyLevel,
  QuizPoolScope,
  resetSeenQuizHistory,
  resolveThemePreviewAudio,
  saveDailyQuizResult,
  saveDuelHighStreak,
  saveJeopardyHighScore,
  saveQuizHighScore,
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

type QuizPageMode = 'infinite_3s' | 'daily_10' | 'duel' | 'jeopardy';

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
    pillClass: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/35',
    iconClass: 'text-emerald-400',
  },
  medium: {
    label: 'Medium',
    Icon: Zap,
    pillClass: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/35',
    iconClass: 'text-amber-400',
  },
  hard: {
    label: 'Hard',
    Icon: Flame,
    pillClass: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/35',
    iconClass: 'text-rose-400',
  },
};

const DifficultyBadge: React.FC<{ difficulty: QuizDifficultyLevel; compact?: boolean }> = ({
  difficulty,
  compact = false,
}) => {
  const meta = DIFFICULTY_STYLES[difficulty];
  const Icon = meta.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold ${meta.pillClass} ${
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-[11px]'
      }`}
    >
      <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      <span>{meta.label}</span>
    </span>
  );
};

function fmtSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function findAnimeByTitle(title: string): Anime | undefined {
  const low = title.trim().toLowerCase();
  return animeStore.all().find((a) => a.title.toLowerCase() === low);
}

const KIND_LABELS: Record<JeopardyCellKind, string> = {
  audio: 'OP/ED Audio',
  visual_crop: 'Visual Crop',
  riddle_trivia: 'Lore Riddle',
  studio_year: 'Studio & Year',
};

export const QuizView: React.FC<QuizViewProps> = ({
  libraryState,
  mediaType,
  onExplore,
  onOpenAnime,
}) => {
  const [pageMode, setPageMode] = useState<QuizPageMode>('infinite_3s');
  const [poolScope, setPoolScope] = useState<QuizPoolScope>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<QuizDifficultyFilter>('all');
  const [kindFilter, setKindFilter] = useState<'all' | JeopardyCellKind>('all');
  const [typeAnswerMode, setTypeAnswerMode] = useState(false);
  const [typedGuess, setTypedGuess] = useState('');
  const [blindMode, setBlindMode] = useState(true);
  const [seenCount, setSeenCount] = useState(() => getSeenQuizCount());

  // Infinite 3s Blitz state
  const sessionSeenRef = useRef<Set<string>>(new Set());
  const [questionNum, setQuestionNum] = useState(1);
  const [answeredTotal, setAnsweredTotal] = useState(0);
  const [answeredCorrect, setAnsweredCorrect] = useState(0);
  const [currentQ, setCurrentQ] = useState<InfiniteQuizQuestion>(() =>
    buildNextInfiniteQuestion({
      scope: 'all',
      entries: libraryState.entries,
      mediaType,
      difficulty: 'all',
    })
  );
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [snippetStep, setSnippetStep] = useState(0);
  const [hintStep, setHintStep] = useState(0);
  const [eliminatedOptions, setEliminatedOptions] = useState<string[]>([]);
  const [bestScore, setBestScore] = useState(() => getQuizHighScore());

  // Daily 10 state
  const todayKey = useMemo(() => getTodayDateKey(), []);
  const dailyQuestions = useMemo(() => buildDailyTenRound(todayKey), [todayKey]);
  const [dailySaved, setDailySaved] = useState<DailyQuizResult | null>(() =>
    getDailyQuizResult(todayKey)
  );
  const [dailyIndex, setDailyIndex] = useState(0);
  const [dailyScore, setDailyScore] = useState(0);
  const [dailyPicked, setDailyPicked] = useState<string | null>(null);
  const [dailyOutcomes, setDailyOutcomes] = useState<('hit' | 'miss')[]>([]);
  const [dailySnippetStep, setDailySnippetStep] = useState(0);
  const [dailyHintStep, setDailyHintStep] = useState(0);
  const [dailyEliminated, setDailyEliminated] = useState<string[]>([]);

  // Higher / Lower Duel state
  const [duelMetricPref, setDuelMetricPref] = useState<'mix' | DuelMetric>('mix');
  const [duelMatchup, setDuelMatchup] = useState<DuelMatchup>(() => buildDuelMatchup());
  const [duelPickedSide, setDuelPickedSide] = useState<'left' | 'right' | null>(null);
  const [duelStreak, setDuelStreak] = useState(0);
  const [duelBest, setDuelBest] = useState(() => getDuelHighStreak());

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

  const myListCount = useMemo(
    () => Object.keys(libraryState.entries).length,
    [libraryState.entries]
  );

  const rankInfo = useMemo(
    () => getQuizRankInfo(Math.max(bestScore, score), seenCount),
    [bestScore, score, seenCount]
  );

  const accuracyPct =
    answeredTotal > 0 ? Math.round((answeredCorrect / answeredTotal) * 100) : 100;

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

  const dailyActiveQ = dailyQuestions[dailyIndex] ?? dailyQuestions[0];

  const loadNextInfinite = (
    nextScope: QuizPoolScope = poolScope,
    nextDiff: QuizDifficultyFilter = difficultyFilter,
    nextKind: 'all' | JeopardyCellKind = kindFilter
  ) => {
    const q = buildNextInfiniteQuestion({
      scope: nextScope,
      entries: libraryState.entries,
      mediaType,
      sessionExclude: sessionSeenRef.current,
      difficulty: nextDiff,
      preferKind: nextKind === 'all' ? undefined : nextKind,
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

  const handleScopeChange = (nextScope: QuizPoolScope) => {
    if (nextScope === 'mylist' && myListCount < 2) {
      toast('Add at least 2 titles to My List first to play My List mode!');
      return;
    }
    triggerHaptic('light');
    audioRef.current?.pause();
    setPlaying(false);
    setPoolScope(nextScope);
    loadNextInfinite(nextScope, difficultyFilter, kindFilter);
  };

  const handleDifficultyChange = (nextDiff: QuizDifficultyFilter) => {
    triggerHaptic('light');
    audioRef.current?.pause();
    setPlaying(false);
    setDifficultyFilter(nextDiff);
    loadNextInfinite(poolScope, nextDiff, kindFilter);
  };

  const handleKindChange = (nextKind: 'all' | JeopardyCellKind) => {
    triggerHaptic('light');
    audioRef.current?.pause();
    setPlaying(false);
    setKindFilter(nextKind);
    loadNextInfinite(poolScope, difficultyFilter, nextKind);
  };

  const activeAudioTarget = useMemo(() => {
    if (pageMode === 'infinite_3s' && currentQ.kind === 'audio') {
      const ladder = SNIPPET_LADDER_BY_DIFFICULTY[currentQ.difficulty] ?? SNIPPET_LADDER_BY_DIFFICULTY.all;
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
    if (pageMode === 'daily_10' && !dailySaved && dailyActiveQ?.kind === 'audio') {
      const ladder = SNIPPET_LADDER_BY_DIFFICULTY[dailyActiveQ.difficulty] ?? SNIPPET_LADDER_BY_DIFFICULTY.all;
      const maxClip = dailyPicked
        ? 30
        : ladder[Math.min(dailySnippetStep, ladder.length - 1)] ?? 30;
      return {
        id: dailyActiveQ.id,
        malId: dailyActiveQ.malId,
        audioQuery: dailyActiveQ.audioQuery,
        songTitle: dailyActiveQ.songTitle,
        artist: dailyActiveQ.artist,
        maxClipSec: maxClip,
      };
    }
    if (pageMode === 'jeopardy' && activeCell?.kind === 'audio') {
      const base = activeCell.initialClipSec ?? 6;
      const maxClip = cellPicked ? 30 : Math.min(30, base + cellClipBoost * 4);
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
  }, [
    pageMode,
    currentQ,
    snippetStep,
    picked,
    dailySaved,
    dailyActiveQ,
    dailyPicked,
    dailySnippetStep,
    activeCell,
    cellClipBoost,
    cellPicked,
  ]);

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
            submitInfiniteAnswer(opt, false);
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
      } else if (pageMode === 'daily_10' && !dailySaved) {
        if (!dailyPicked && !typeAnswerMode && ['1', '2', '3', '4'].includes(e.key)) {
          const opt = dailyActiveQ.options[Number(e.key) - 1];
          if (opt && !dailyEliminated.includes(opt)) {
            e.preventDefault();
            submitDailyAnswer(opt, false);
          }
          return;
        }
        if (dailyPicked && (e.key.toLowerCase() === 'n' || e.key === 'Enter')) {
          e.preventDefault();
          advanceDailyQuestion();
        }
      } else if (pageMode === 'duel') {
        if (!duelPickedSide && (e.key === '1' || e.key === 'ArrowLeft')) {
          e.preventDefault();
          submitDuelChoice('left');
          return;
        }
        if (!duelPickedSide && (e.key === '2' || e.key === 'ArrowRight')) {
          e.preventDefault();
          submitDuelChoice('right');
          return;
        }
        if (duelPickedSide && (e.key.toLowerCase() === 'n' || e.key === 'Enter')) {
          e.preventDefault();
          nextDuelRound();
        }
      } else if (pageMode === 'jeopardy' && activeCell) {
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

  // --- Infinite Blitz Handlers ---
  const activeLadder =
    SNIPPET_LADDER_BY_DIFFICULTY[currentQ.difficulty] ?? SNIPPET_LADDER_BY_DIFFICULTY.all;
  const diffMultiplier = DIFFICULTY_META[currentQ.difficulty].multiplier;
  const basePoints = Math.max(
    40,
    240 - snippetStep * 45 - hintStep * 35 - (eliminatedOptions.length > 0 ? 50 : 0) + streak * 25
  );
  const potentialPoints = Math.round(basePoints * diffMultiplier);

  const triggerFiftyFifty = () => {
    if (picked || eliminatedOptions.length > 0) return;
    const wrong = currentQ.options.filter((o) => o !== currentQ.correctAnswer);
    const toRemove = wrong.sort(() => Math.random() - 0.5).slice(0, 2);
    triggerHaptic('light');
    setEliminatedOptions(toRemove);
  };

  const submitInfiniteAnswer = (guess: string, isTyped = false) => {
    if (picked) return;
    const isCorrect = isTyped
      ? doesTypedGuessMatch(guess, currentQ.correctAnswer, currentQ.aliases)
      : guess === currentQ.correctAnswer;

    markQuizQuestionSeen(currentQ.signature);
    sessionSeenRef.current.add(currentQ.signature);
    setSeenCount(getSeenQuizCount());
    setPicked(isCorrect ? currentQ.correctAnswer : guess);
    setAnsweredTotal((t) => t + 1);

    if (isCorrect) {
      triggerHaptic('success');
      setAnsweredCorrect((c) => c + 1);
      const nextScore = score + potentialPoints;
      setScore(nextScore);
      setStreak((s) => s + 1);
      if (nextScore > bestScore) {
        setBestScore(nextScore);
        saveQuizHighScore(nextScore);
      }
    } else {
      triggerHaptic('medium');
      setStreak(0);
    }
  };

  const advanceNextQuestion = () => {
    triggerHaptic('light');
    audioRef.current?.pause();
    setPlaying(false);
    setQuestionNum((n) => n + 1);
    loadNextInfinite(poolScope, difficultyFilter, kindFilter);
  };

  // --- Daily 10 Handlers ---
  const dailyLadder =
    SNIPPET_LADDER_BY_DIFFICULTY[dailyActiveQ?.difficulty ?? 'medium'] ??
    SNIPPET_LADDER_BY_DIFFICULTY.all;

  const submitDailyAnswer = (guess: string, isTyped = false) => {
    if (dailyPicked || !dailyActiveQ) return;
    const isCorrect = isTyped
      ? doesTypedGuessMatch(guess, dailyActiveQ.correctAnswer, dailyActiveQ.aliases)
      : guess === dailyActiveQ.correctAnswer;

    setDailyPicked(isCorrect ? dailyActiveQ.correctAnswer : guess);
    const pts = isCorrect
      ? Math.round(
          Math.max(50, 200 - dailySnippetStep * 40 - dailyHintStep * 35 - (dailyEliminated.length > 0 ? 50 : 0)) *
            DIFFICULTY_META[dailyActiveQ.difficulty].multiplier
        )
      : 0;
    setDailyScore((s) => s + pts);
    setDailyOutcomes((prev) => [...prev, isCorrect ? 'hit' : 'miss']);
    triggerHaptic(isCorrect ? 'success' : 'medium');
  };

  const advanceDailyQuestion = () => {
    triggerHaptic('light');
    audioRef.current?.pause();
    setPlaying(false);
    if (dailyIndex + 1 >= dailyQuestions.length) {
      const hits = dailyOutcomes.filter((x) => x === 'hit').length;
      const finalRes: DailyQuizResult = {
        dateKey: todayKey,
        score: dailyScore,
        correctCount: hits,
        total: dailyQuestions.length,
        outcomes: dailyOutcomes,
        completedAt: Date.now(),
      };
      saveDailyQuizResult(finalRes);
      setDailySaved(finalRes);
      return;
    }
    setDailyIndex((i) => i + 1);
    setDailyPicked(null);
    setTypedGuess('');
    setDailySnippetStep(0);
    setDailyHintStep(0);
    setDailyEliminated([]);
  };

  const copyDailyShareGrid = async () => {
    if (!dailySaved) return;
    const grid = dailySaved.outcomes.map((o) => (o === 'hit' ? '🟩' : '🟥')).join('');
    const text = `ListTube Daily 10 (${dailySaved.dateKey})\nScore: ${dailySaved.score} pts · ${dailySaved.correctCount}/${dailySaved.total}\n${grid}\nhttps://listtube.vercel.app/quiz`;
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied Daily 10 score card to clipboard!');
    } catch {
      toast('Score card ready to copy');
    }
  };

  // --- Score Duel Handlers ---
  const nextDuelRound = (pref: 'mix' | DuelMetric = duelMetricPref) => {
    triggerHaptic('light');
    setDuelPickedSide(null);
    setDuelMatchup(buildDuelMatchup(pref === 'mix' ? undefined : pref));
  };

  const submitDuelChoice = (side: 'left' | 'right') => {
    if (duelPickedSide) return;
    setDuelPickedSide(side);
    const won = side === duelMatchup.winner;
    if (won) {
      triggerHaptic('success');
      const next = duelStreak + 1;
      setDuelStreak(next);
      if (next > duelBest) {
        setDuelBest(next);
        saveDuelHighStreak(next);
      }
    } else {
      triggerHaptic('medium');
      setDuelStreak(0);
    }
  };

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
      <div className="space-y-3 rounded-2xl border border-white/[0.1] bg-white/[0.05] p-4 sm:p-5">
        <div className="flex items-center justify-between text-[11.5px] font-bold text-[#3EA6FF]">
          <span className="flex items-center gap-2">
            {label}
            {playing && (
              <span className="inline-flex items-end gap-0.5" aria-hidden="true">
                <span className="h-2.5 w-0.5 animate-pulse rounded bg-[#FF0000]" />
                <span className="h-3.5 w-0.5 animate-bounce rounded bg-amber-400" />
                <span className="h-2 w-0.5 animate-pulse rounded bg-[#3EA6FF]" />
              </span>
            )}
          </span>
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10.5px] font-bold text-emerald-300">
            {cap < 30 ? `Clip Limit: ${cap}s` : 'Full 30s Preview'}
          </span>
        </div>

        <div className="flex items-center gap-3.5">
          <button
            type="button"
            disabled={audioLoading || !track?.previewUrl}
            onClick={() => void togglePlay()}
            aria-label={playing ? 'Pause theme song' : 'Play theme song'}
            className="lt-press flex h-13 w-13 shrink-0 items-center justify-center rounded-full bg-[#FF0000] text-white shadow-lg transition hover:bg-[#D90000] disabled:opacity-45"
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
              <p className="truncate text-[13.5px] font-bold text-white">{titleText}</p>
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                className="rounded-full p-1.5 text-[#AAAAAA] hover:bg-white/10 hover:text-white"
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
              className="relative h-2.5 cursor-pointer overflow-hidden rounded-full bg-white/10"
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

            <div className="flex items-center justify-between text-[11px] text-[#AAAAAA]">
              <span>{fmtSec(progress.cur)}</span>
              <span>
                {audioLoading
                  ? 'Resolving studio audio…'
                  : track?.previewUrl
                    ? `Playing up to ${cap}s`
                    : 'Preview unavailable — use clues below'}
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
          className="space-y-2.5"
        >
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <input
              type="text"
              value={typedGuess}
              onChange={(e) => setTypedGuess(e.target.value)}
              placeholder="Type anime title or acronym (AOT, JJK, FMAB)…"
              autoFocus
              className="h-14 flex-1 rounded-2xl border border-white/[0.14] bg-white/[0.06] px-4 text-[15px] font-semibold text-white placeholder:text-neutral-500 outline-none focus:border-[#3EA6FF]"
            />
            <button
              type="submit"
              disabled={!typedGuess.trim()}
              className="lt-press h-14 rounded-2xl bg-white px-7 text-[14.5px] font-black text-black disabled:opacity-40"
            >
              Lock In
            </button>
          </div>
          <p className="text-[11.5px] text-neutral-400">
            Pro Type-In mode: forgiving spelling &amp; abbreviations supported.
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
          className={`rounded-2xl border p-4 text-[14.5px] font-bold ${
            won
              ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
              : 'border-rose-400/40 bg-rose-500/15 text-rose-200'
          }`}
        >
          {won ? 'Spot on!' : `Missed — you guessed "${selected}"`} · Answer: {correctAnswer}
        </div>
      );
    }

    const LETTERS = ['A', 'B', 'C', 'D'];
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {options.map((opt, idxOpt) => {
          const isCorrect = opt === correctAnswer;
          const isPicked = selected === opt;
          const isRemoved = !isAnswered && eliminated.includes(opt);
          let cls =
            'border-white/[0.12] bg-[#1D1D22] text-neutral-100 hover:border-white/30 hover:bg-[#27272E]';
          if (isRemoved) {
            cls = 'border-white/[0.04] bg-white/[0.02] text-neutral-600 line-through opacity-40';
          } else if (isAnswered) {
            if (isCorrect)
              cls = 'border-emerald-400/70 bg-emerald-500/20 text-emerald-100 shadow-lg';
            else if (isPicked)
              cls = 'border-rose-400/70 bg-rose-500/20 text-rose-100';
            else cls = 'border-white/[0.05] bg-white/[0.03] text-neutral-500';
          }
          return (
            <button
              key={opt}
              type="button"
              disabled={isAnswered || isRemoved}
              onClick={() => onSelectChoice(opt)}
              className={`lt-press flex min-h-[64px] items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left text-[14.5px] font-bold leading-snug transition sm:min-h-[72px] sm:px-5 sm:text-[15.5px] ${cls}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[12px] font-black ${
                    isAnswered && isCorrect
                      ? 'bg-emerald-500 text-black'
                      : isAnswered && isPicked
                        ? 'bg-rose-500 text-white'
                        : 'bg-white/[0.08] text-[#AAAAAA]'
                  }`}
                >
                  {LETTERS[idxOpt] ?? idxOpt + 1}
                </span>
                <span className="line-clamp-2">{opt}</span>
              </div>
              {isAnswered && isCorrect && (
                <Check className="h-5 w-5 shrink-0 text-emerald-300" />
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
        className="lt-press inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-3 py-1.5 text-[11.5px] font-bold text-[#3EA6FF] hover:bg-white/[0.16]"
      >
        <ExternalLink className="h-3 w-3" />
        View &amp; Track {match.title}
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

  return (
    <div
      role="region"
      aria-label="OP and ED Music Quiz"
      className="mx-auto min-h-screen max-w-6xl space-y-5 bg-[#0F0F0F] px-4 pb-32 pt-5 text-white sm:px-6 lg:px-8 lg:pb-16"
    >
      {/* Dedicated Page Header + Rank + Modes */}
      <div className="liquid-glass rounded-3xl border border-white/[0.12] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF0000] to-amber-500 text-white shadow-lg">
              {pageMode === 'jeopardy' ? (
                <Grid className="h-5 w-5" />
              ) : pageMode === 'duel' ? (
                <Star className="h-5 w-5" />
              ) : pageMode === 'daily_10' ? (
                <Calendar className="h-5 w-5" />
              ) : (
                <Music className="h-5 w-5" />
              )}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[19px] font-black tracking-tight text-white sm:text-[22px]">
                  Infinite Anime Quiz Arena
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-0.5 text-[10.5px] font-bold text-amber-300 ring-1 ring-amber-400/30">
                  <Award className="h-3 w-3" />
                  {rankInfo.title}
                </span>
              </div>
              <p className="text-[12px] text-[#AAAAAA]">
                {pageMode === 'jeopardy'
                  ? `Jeopardy Best: ${bestJeopardy} pts · 4×4 Game Board`
                  : pageMode === 'duel'
                    ? `Score Duel Streak: ${duelStreak} · Best Streak: ${duelBest}`
                    : pageMode === 'daily_10'
                      ? `Daily 10 Challenge (${todayKey}) · Same seed worldwide`
                      : `Score: ${score} · Streak: ${streak} · Best: ${bestScore} · Accuracy: ${accuracyPct}% · Unique Played: ${seenCount}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(pageMode === 'infinite_3s' || pageMode === 'daily_10' || pageMode === 'jeopardy') && (
              <>
                <button
                  type="button"
                  onClick={() => setTypeAnswerMode((v) => !v)}
                  className={`lt-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold transition ${
                    typeAnswerMode
                      ? 'bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/35'
                      : 'bg-white/[0.08] text-[#CCCCCC] hover:bg-white/[0.14]'
                  }`}
                >
                  {typeAnswerMode ? <Keyboard className="h-3.5 w-3.5" /> : <ListChecks className="h-3.5 w-3.5" />}
                  {typeAnswerMode ? 'Type-In' : 'Choices'}
                </button>

                <button
                  type="button"
                  onClick={() => setBlindMode((v) => !v)}
                  className={`lt-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold transition ${
                    blindMode
                      ? 'bg-[#3EA6FF]/20 text-[#3EA6FF] ring-1 ring-[#3EA6FF]/35'
                      : 'bg-white/[0.08] text-[#CCCCCC] hover:bg-white/[0.14]'
                  }`}
                >
                  {blindMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {blindMode ? 'Blind' : 'Title On'}
                </button>
              </>
            )}

            {seenCount > 0 && pageMode === 'infinite_3s' && (
              <button
                type="button"
                onClick={() => {
                  resetSeenQuizHistory();
                  sessionSeenRef.current.clear();
                  setSeenCount(0);
                  toast('Non-repeating question history reset');
                }}
                title="Reset non-repeating seen history"
                className="lt-press inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-[#AAAAAA] hover:bg-white/[0.14] hover:text-white"
              >
                <Trash2 className="h-3 w-3" />
                Reset Seen
              </button>
            )}
          </div>
        </div>

        {/* Mode Switcher Bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] pt-3.5">
          <div className="flex flex-wrap rounded-2xl bg-white/[0.06] p-1 sm:rounded-full">
            <button
              type="button"
              onClick={() => {
                audioRef.current?.pause();
                setPlaying(false);
                setPageMode('infinite_3s');
              }}
              className={`lt-press flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition ${
                pageMode === 'infinite_3s'
                  ? 'bg-white text-black shadow'
                  : 'text-[#CCCCCC] hover:text-white'
              }`}
            >
              <Flame className="h-3.5 w-3.5 text-[#FF0000]" />
              3 sec OP/ED
            </button>
            <button
              type="button"
              onClick={() => {
                audioRef.current?.pause();
                setPlaying(false);
                setPageMode('daily_10');
              }}
              className={`lt-press flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition ${
                pageMode === 'daily_10'
                  ? 'bg-white text-black shadow'
                  : 'text-[#CCCCCC] hover:text-white'
              }`}
            >
              <Calendar className="h-3.5 w-3.5 text-emerald-500" />
              Daily 10
              {dailySaved && (
                <span className="rounded bg-emerald-500/20 px-1.5 text-[9.5px] font-black text-emerald-600">
                  {dailySaved.correctCount}/{dailySaved.total}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                audioRef.current?.pause();
                setPlaying(false);
                setPageMode('duel');
              }}
              className={`lt-press flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition ${
                pageMode === 'duel'
                  ? 'bg-white text-black shadow'
                  : 'text-[#CCCCCC] hover:text-white'
              }`}
            >
              <Gamepad2 className="h-3.5 w-3.5 text-[#3EA6FF]" />
              Score Duel
            </button>
            <button
              type="button"
              onClick={() => {
                audioRef.current?.pause();
                setPlaying(false);
                setPageMode('jeopardy');
              }}
              className={`lt-press flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition ${
                pageMode === 'jeopardy'
                  ? 'bg-white text-black shadow'
                  : 'text-[#CCCCCC] hover:text-white'
              }`}
            >
              <Grid className="h-3.5 w-3.5 text-amber-500" />
              Anime Jeopardy
            </button>
          </div>

          {pageMode === 'infinite_3s' && (
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex rounded-full bg-white/[0.06] p-1 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => handleScopeChange('all')}
                  className={`rounded-full px-3 py-1 transition ${
                    poolScope === 'all' ? 'bg-[#FF0000] text-white' : 'text-[#AAAAAA] hover:text-white'
                  }`}
                >
                  All Anime
                </button>
                <button
                  type="button"
                  onClick={() => handleScopeChange('mylist')}
                  className={`rounded-full px-3 py-1 transition ${
                    poolScope === 'mylist'
                      ? 'bg-[#3EA6FF] text-black'
                      : 'text-[#AAAAAA] hover:text-white'
                  }`}
                >
                  My List ({myListCount})
                </button>
              </div>
              <span className="rounded-full bg-[#FF0000]/15 px-3 py-1 text-[11px] font-bold text-rose-200 ring-1 ring-[#FF0000]/30">
                3 sec Blitz · Endless
              </span>
            </div>
          )}

          {pageMode === 'jeopardy' && (
            <button
              type="button"
              onClick={() => {
                setTwoPlayer((v) => !v);
                setActivePlayer(0);
              }}
              className={`lt-press flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11.5px] font-bold transition ${
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

        {/* Difficulty Icons Bar + Category Filter for Endless Blitz */}
        {pageMode === 'infinite_3s' && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 border-t border-white/[0.06] pt-3">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quiz difficulty">
              <button
                type="button"
                onClick={() => handleDifficultyChange('all')}
                className={`lt-press inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-bold transition ${
                  difficultyFilter === 'all'
                    ? 'bg-[#3EA6FF] text-black'
                    : 'bg-white/[0.06] text-[#CCCCCC] hover:bg-white/[0.12]'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Mixed
              </button>
              <button
                type="button"
                onClick={() => handleDifficultyChange('easy')}
                className={`lt-press inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-bold transition ${
                  difficultyFilter === 'easy'
                    ? 'bg-emerald-500 text-black'
                    : 'bg-white/[0.06] text-emerald-300 hover:bg-emerald-500/15'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Easy (6s · 1×)
              </button>
              <button
                type="button"
                onClick={() => handleDifficultyChange('medium')}
                className={`lt-press inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-bold transition ${
                  difficultyFilter === 'medium'
                    ? 'bg-amber-400 text-black'
                    : 'bg-white/[0.06] text-amber-300 hover:bg-amber-500/15'
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                Medium (3s · 1.25×)
              </button>
              <button
                type="button"
                onClick={() => handleDifficultyChange('hard')}
                className={`lt-press inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-bold transition ${
                  difficultyFilter === 'hard'
                    ? 'bg-rose-500 text-white'
                    : 'bg-white/[0.06] text-rose-300 hover:bg-rose-500/15'
                }`}
              >
                <Flame className="h-3.5 w-3.5" />
                Hard (2s · 1.75×)
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1 text-[11px] font-semibold">
              {(
                [
                  ['all', 'All Rounds'],
                  ['audio', 'Audio OP/ED'],
                  ['visual_crop', 'Blurred Poster'],
                  ['riddle_trivia', 'Riddles'],
                  ['studio_year', 'Studio & Year'],
                ] as const
              ).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleKindChange(k)}
                  className={`rounded-full px-2.5 py-1 transition ${
                    kindFilter === k
                      ? 'bg-white text-black font-bold'
                      : 'bg-white/[0.05] text-[#AAAAAA] hover:text-white'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
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
        <div className="rounded-3xl border border-white/[0.08] bg-[#161619] p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[12px] font-bold text-[#3EA6FF]">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                Question #{questionNum} · Up to +{potentialPoints} pts
              </span>
              <DifficultyBadge difficulty={currentQ.difficulty} />
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full bg-white/[0.05] px-2.5 py-0.5 text-[10.5px] font-semibold text-[#8E8E93] lg:inline">
                Space Play · 1-4 Pick · 5 Split 50/50 · H Clue · N Next
              </span>
              <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-semibold text-neutral-300">
                {currentQ.fromMyList ? 'From Your List' : KIND_LABELS[currentQ.kind]}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
            {/* Desktop Left Column: Audio / Visual Challenge + Hints + 50/50 */}
            <div className="space-y-4 lg:col-span-5">
              {currentQ.kind === 'audio' &&
                renderAudioCard(
                  `In-App Studio Preview · ${DIFFICULTY_META[currentQ.difficulty].starterSec}s Starter`,
                  blindMode && !picked
                    ? 'Mystery Theme Track'
                    : `${songDisplayTitle} · ${songDisplayArtist}`
                )}

              {currentQ.kind === 'visual_crop' && currentQ.imageUrl && (
                <div className="relative mx-auto aspect-video w-full overflow-hidden rounded-2xl border border-white/[0.12] bg-black">
                  <img
                    src={currentQ.imageUrl}
                    alt="Blurred frame challenge"
                    className={`h-full w-full object-cover transition-all duration-500 ${blurScaleClasses(
                      currentQ.difficulty,
                      hintStep,
                      Boolean(picked)
                    )}`}
                  />
                  {!picked && (
                    <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/75 px-3 py-1 text-[10.5px] font-bold text-white">
                      {hintStep === 0 ? 'Ultra Blur' : hintStep === 1 ? 'Half Revealed' : 'Nearly Clear'}
                    </span>
                  )}
                </div>
              )}

              {!picked && (
                <div className="flex flex-wrap items-center gap-2">
                  {currentQ.kind === 'audio' && snippetStep < activeLadder.length - 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSnippetStep((s) => Math.min(activeLadder.length - 1, s + 1));
                        if (audioRef.current && track?.previewUrl) {
                          audioRef.current.currentTime = 0;
                          void audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
                        }
                      }}
                      className="lt-press inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3.5 py-1.5 text-[12px] font-bold text-amber-200 ring-1 ring-amber-400/30 hover:bg-amber-500/25"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Extend to {activeLadder[snippetStep + 1]}s (-45 pts)
                    </button>
                  )}

                  {currentQ.clues.length > hintStep && (
                    <button
                      type="button"
                      onClick={() => setHintStep((h) => h + 1)}
                      className="lt-press inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3.5 py-1.5 text-[12px] font-bold text-[#CCCCCC] hover:bg-white/[0.15]"
                    >
                      <HelpCircle className="h-3.5 w-3.5 text-[#3EA6FF]" />
                      {currentQ.kind === 'visual_crop'
                        ? `Unblur & Clue ${hintStep + 1} (-35 pts)`
                        : `Reveal Clue ${hintStep + 1} (-35 pts)`}
                    </button>
                  )}

                  {!typeAnswerMode && eliminatedOptions.length === 0 && (
                    <button
                      type="button"
                      onClick={triggerFiftyFifty}
                      className="lt-press inline-flex items-center gap-1.5 rounded-full bg-purple-500/15 px-3.5 py-1.5 text-[12px] font-bold text-purple-200 ring-1 ring-purple-400/30 hover:bg-purple-500/25"
                    >
                      <Split className="h-3.5 w-3.5" />
                      50/50 (-50 pts)
                    </button>
                  )}
                </div>
              )}

              {(hintStep > 0 || currentQ.kind === 'riddle_trivia') && (
                <div className="space-y-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3.5 text-[13px] text-neutral-200">
                  {currentQ.clues
                    .slice(0, currentQ.kind === 'riddle_trivia' ? Math.max(1, hintStep + 1) : hintStep)
                    .map((c, ci) => (
                      <p key={ci}>
                        <span className="font-bold text-[#3EA6FF]">Clue {ci + 1}:</span> {c}
                      </p>
                    ))}
                </div>
              )}
            </div>

            {/* Desktop Right Column: Question + Big Answer Grid + Feedback + View & Track CTA */}
            <div className="space-y-4 lg:col-span-7">
              <p className="text-[16px] font-extrabold leading-snug text-white sm:text-[19px]">
                {currentQ.kind === 'audio' && blindMode && !picked
                  ? `Listen to the ${DIFFICULTY_META[currentQ.difficulty].starterSec}s clip — which anime is this theme from?`
                  : currentQ.prompt}
              </p>

              {renderBigAnswerGrid(
                currentQ.options,
                currentQ.correctAnswer,
                picked,
                (opt) => submitInfiniteAnswer(opt, false),
                (val) => submitInfiniteAnswer(val, true),
                currentQ.aliases,
                eliminatedOptions
              )}

              {picked && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
                  <div className="space-y-1.5">
                    <div className="text-[13.5px] font-bold">
                      {picked === currentQ.correctAnswer ? (
                        <span className="text-emerald-300">
                          Correct! +{potentialPoints} pts · {currentQ.animeTitle}
                          {currentQ.songTitle ? ` — “${currentQ.songTitle}”` : ''}
                        </span>
                      ) : (
                        <span className="text-rose-300">
                          Answer: {currentQ.correctAnswer} ({currentQ.animeTitle})
                        </span>
                      )}
                    </div>
                    {renderTrackShortcutButton(currentQ.animeTitle)}
                  </div>
                  <button
                    type="button"
                    onClick={advanceNextQuestion}
                    className="lt-press rounded-full bg-[#FF0000] px-6 py-2.5 text-[13.5px] font-bold text-white shadow-lg hover:bg-[#D90000]"
                  >
                    Next Unseen Question &rarr;
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : pageMode === 'daily_10' ? (
        <div className="rounded-3xl border border-white/[0.08] bg-[#161619] p-5 sm:p-6">
          {dailySaved ? (
            <div className="space-y-4 py-6 text-center">
              <Trophy className="mx-auto h-12 w-12 text-emerald-400" />
              <h2 className="text-[22px] font-black text-white">
                Daily 10 Complete · {dailySaved.correctCount}/{dailySaved.total}
              </h2>
              <p className="text-[14px] text-[#AAAAAA]">
                Score: <span className="font-bold text-white">{dailySaved.score} pts</span> · Come back tomorrow for a fresh global seed!
              </p>
              <div className="flex justify-center gap-1.5 text-[22px]">
                {dailySaved.outcomes.map((o, i) => (
                  <span key={i}>{o === 'hit' ? '🟩' : '🟥'}</span>
                ))}
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => void copyDailyShareGrid()}
                  className="lt-press inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-2.5 text-[13px] font-black text-black hover:bg-emerald-400"
                >
                  <Copy className="h-4 w-4" />
                  Share Emoji Result
                </button>
                <button
                  type="button"
                  onClick={() => setPageMode('infinite_3s')}
                  className="lt-press rounded-full bg-white/[0.08] px-5 py-2.5 text-[13px] font-bold text-white hover:bg-white/[0.16]"
                >
                  Play Endless Blitz &rarr;
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-black text-emerald-300">
                    Daily Round {dailyIndex + 1} / {dailyQuestions.length}
                  </span>
                  <DifficultyBadge difficulty={dailyActiveQ.difficulty} />
                </div>
                <div className="flex items-center gap-1.5">
                  {dailyQuestions.map((_, idx) => {
                    const out = dailyOutcomes[idx];
                    return (
                      <span
                        key={idx}
                        className={`h-2.5 w-5 rounded-full transition ${
                          out === 'hit'
                            ? 'bg-emerald-400'
                            : out === 'miss'
                              ? 'bg-rose-400'
                              : idx === dailyIndex
                                ? 'bg-white'
                                : 'bg-white/15'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="space-y-4 lg:col-span-5">
                  {dailyActiveQ.kind === 'audio' &&
                    renderAudioCard(
                      `Daily Audio · Round ${dailyIndex + 1}`,
                      blindMode && !dailyPicked
                        ? 'Daily Mystery Track'
                        : `${dailyActiveQ.songTitle} · ${dailyActiveQ.artist}`
                    )}

                  {!dailyPicked && (
                    <div className="flex flex-wrap items-center gap-2">
                      {dailyActiveQ.kind === 'audio' && dailySnippetStep < dailyLadder.length - 1 && (
                        <button
                          type="button"
                          onClick={() => setDailySnippetStep((s) => Math.min(dailyLadder.length - 1, s + 1))}
                          className="lt-press inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3.5 py-1.5 text-[12px] font-bold text-amber-200 ring-1 ring-amber-400/30"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Extend to {dailyLadder[dailySnippetStep + 1]}s
                        </button>
                      )}
                      {dailyActiveQ.clues.length > dailyHintStep && (
                        <button
                          type="button"
                          onClick={() => setDailyHintStep((h) => h + 1)}
                          className="lt-press inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3.5 py-1.5 text-[12px] font-bold text-[#CCCCCC]"
                        >
                          <HelpCircle className="h-3.5 w-3.5 text-[#3EA6FF]" />
                          Reveal Clue {dailyHintStep + 1}
                        </button>
                      )}
                      {!typeAnswerMode && dailyEliminated.length === 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const wrong = dailyActiveQ.options.filter((o) => o !== dailyActiveQ.correctAnswer);
                            setDailyEliminated(wrong.sort(() => Math.random() - 0.5).slice(0, 2));
                          }}
                          className="lt-press inline-flex items-center gap-1.5 rounded-full bg-purple-500/15 px-3.5 py-1.5 text-[12px] font-bold text-purple-200 ring-1 ring-purple-400/30"
                        >
                          <Split className="h-3.5 w-3.5" />
                          50/50
                        </button>
                      )}
                    </div>
                  )}

                  {(dailyHintStep > 0 || dailyActiveQ.kind === 'riddle_trivia') && (
                    <div className="space-y-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3.5 text-[13px] text-neutral-200">
                      {dailyActiveQ.clues
                        .slice(0, dailyActiveQ.kind === 'riddle_trivia' ? Math.max(1, dailyHintStep + 1) : dailyHintStep)
                        .map((c, ci) => (
                          <p key={ci}>
                            <span className="font-bold text-[#3EA6FF]">Clue {ci + 1}:</span> {c}
                          </p>
                        ))}
                    </div>
                  )}
                </div>

                <div className="space-y-4 lg:col-span-7">
                  <p className="text-[17px] font-extrabold text-white sm:text-[19px]">
                    {dailyActiveQ.kind === 'audio' && blindMode && !dailyPicked
                      ? `Daily Round #${dailyIndex + 1} — Which anime is this theme from?`
                      : dailyActiveQ.prompt}
                  </p>

                  {renderBigAnswerGrid(
                    dailyActiveQ.options,
                    dailyActiveQ.correctAnswer,
                    dailyPicked,
                    (opt) => submitDailyAnswer(opt, false),
                    (val) => submitDailyAnswer(val, true),
                    dailyActiveQ.aliases,
                    dailyEliminated
                  )}

                  {dailyPicked && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
                      <span className="text-[13px] font-bold text-white">
                        {dailyPicked === dailyActiveQ.correctAnswer
                          ? `Correct! ${dailyActiveQ.animeTitle}`
                          : `Answer: ${dailyActiveQ.correctAnswer}`}
                      </span>
                      <button
                        type="button"
                        onClick={advanceDailyQuestion}
                        className="lt-press rounded-full bg-[#FF0000] px-6 py-2.5 text-[13px] font-bold text-white"
                      >
                        {dailyIndex + 1 >= dailyQuestions.length ? 'Finish Daily 10 →' : 'Next Round →'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : pageMode === 'duel' ? (
        <div className="space-y-5 rounded-3xl border border-white/[0.08] bg-[#161619] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="rounded-full bg-[#3EA6FF]/15 px-3 py-1 text-[11px] font-bold text-[#3EA6FF]">
                {duelMatchup.unitLabel} Duel
              </span>
              <h2 className="mt-2 text-[19px] font-black text-white sm:text-[22px]">
                {duelMatchup.question}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-full bg-white/[0.06] p-1 text-[11px] font-bold">
              {(
                [
                  ['mix', 'Mixed'],
                  ['score', 'Score'],
                  ['popularity', 'Popularity'],
                  ['year', 'Year'],
                  ['episodes', 'Episodes'],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setDuelMetricPref(m);
                    nextDuelRound(m);
                  }}
                  className={`rounded-full px-3 py-1 transition ${
                    duelMetricPref === m ? 'bg-white text-black' : 'text-[#AAAAAA] hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(['left', 'right'] as const).map((side) => {
              const card = duelMatchup[side];
              const isPicked = duelPickedSide === side;
              const isWinner = duelMatchup.winner === side;
              const revealed = duelPickedSide !== null;
              const statDisplay =
                duelMatchup.metric === 'score'
                  ? `${card.score.toFixed(1)} ★`
                  : duelMatchup.metric === 'popularity'
                    ? `${card.popularity.toLocaleString()} fans`
                    : duelMatchup.metric === 'year'
                      ? `${card.year}`
                      : `${card.episodes} eps`;

              let ringCls = 'border-white/[0.12] bg-[#1E1E24] hover:border-white/35';
              if (revealed) {
                ringCls = isWinner
                  ? 'border-emerald-400 bg-emerald-500/15 shadow-lg'
                  : isPicked
                    ? 'border-rose-400 bg-rose-500/15'
                    : 'border-white/[0.06] bg-white/[0.03] opacity-70';
              }

              return (
                <button
                  key={`${duelMatchup.id}-${side}`}
                  type="button"
                  disabled={revealed}
                  onClick={() => submitDuelChoice(side)}
                  className={`lt-press group flex items-center gap-4 rounded-2xl border p-4 text-left transition ${ringCls}`}
                >
                  <div className="h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-black/50">
                    {card.cover ? (
                      <img
                        src={card.cover}
                        alt={card.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#FF0000]/30 to-amber-500/20">
                        <Music className="h-6 w-6 text-white/60" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#8E8E93]">
                      Choice {side === 'left' ? '1' : '2'}
                    </span>
                    <p className="line-clamp-2 text-[16px] font-black text-white">
                      {card.title}
                    </p>
                    <p className="truncate text-[11.5px] text-[#AAAAAA]">
                      {[card.studio, ...card.genres].filter(Boolean).join(' · ')}
                    </p>
                    {revealed ? (
                      <p
                        className={`inline-block rounded-lg px-2.5 py-1 text-[14px] font-black ${
                          isWinner ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/10 text-white'
                        }`}
                      >
                        {statDisplay}
                      </p>
                    ) : (
                      <p className="text-[12px] font-bold text-[#3EA6FF] group-hover:underline">
                        Pick this anime &rarr;
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {duelPickedSide && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
              <span
                className={`text-[14px] font-black ${
                  duelPickedSide === duelMatchup.winner ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {duelPickedSide === duelMatchup.winner
                  ? `Correct! Streak: ${duelStreak}`
                  : 'Wrong pick — streak reset to 0'}
              </span>
              <button
                type="button"
                onClick={() => nextDuelRound()}
                className="lt-press rounded-full bg-[#FF0000] px-6 py-2.5 text-[13px] font-bold text-white"
              >
                Next Duel &rarr;
              </button>
            </div>
          )}
        </div>
      ) : activeCell ? (
        <div className="space-y-4 rounded-3xl border border-white/[0.08] bg-[#161619] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={closeActiveCell}
              className="flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3.5 py-1.5 text-[12px] font-bold text-neutral-200 hover:bg-white/[0.15]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Board
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <DifficultyBadge difficulty={activeCell.difficulty} />
              {activeCell.isDailyDouble && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-amber-300 ring-1 ring-amber-400/40">
                  <Crown className="h-3.5 w-3.5" />
                  Daily Double 2×
                </span>
              )}
              <span className="rounded-full bg-[#3EA6FF]/15 px-3.5 py-1 text-[12px] font-black text-[#3EA6FF]">
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
            <div className="relative mx-auto aspect-video w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.12] bg-black">
              <img
                src={activeCell.imageUrl}
                alt="Blurred anime challenge"
                className={`h-full w-full object-cover transition-all duration-500 ${blurScaleClasses(
                  activeCell.difficulty,
                  cellHintLevel,
                  Boolean(cellPicked)
                )}`}
              />
            </div>
          )}

          <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
            <p className="text-[16px] font-extrabold text-white">{activeCell.prompt}</p>
            <div className="space-y-1 text-[13px] text-neutral-300">
              {(activeCell.kind === 'riddle_trivia'
                ? activeCell.clues.slice(0, cellHintLevel + 1)
                : activeCell.clues.slice(0, cellHintLevel)
              ).map((clue, ci) => (
                <p key={ci} className="rounded-lg bg-white/[0.04] px-3 py-1.5">
                  {clue}
                </p>
              ))}
            </div>
          </div>

          {!cellPicked && (
            <div className="flex flex-wrap items-center gap-2">
              {activeCell.kind === 'audio' &&
                (activeCell.initialClipSec ?? 6) + cellClipBoost * 4 < 25 && (
                  <button
                    type="button"
                    onClick={() => {
                      setCellClipBoost((b) => b + 1);
                      if (audioRef.current && track?.previewUrl) {
                        audioRef.current.currentTime = 0;
                        void audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
                      }
                    }}
                    className="lt-press inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3.5 py-1.5 text-[12px] font-bold text-amber-200 ring-1 ring-amber-400/30"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    +4s Audio (-50 pts)
                  </button>
                )}

              {cellHintLevel < (activeCell.kind === 'riddle_trivia' ? 2 : 3) && (
                <button
                  type="button"
                  onClick={() => setCellHintLevel((h) => h + 1)}
                  className="lt-press inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-3.5 py-1.5 text-[12px] font-bold text-[#CCCCCC] hover:bg-white/[0.15]"
                >
                  <HelpCircle className="h-3.5 w-3.5 text-[#3EA6FF]" />
                  {activeCell.kind === 'visual_crop' ? 'Unblur / Clue (-50 pts)' : 'Reveal Clue (-50 pts)'}
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
            <div className="flex items-center justify-between border-t border-white/[0.08] pt-4">
              <span className="text-[13px] font-bold text-white">
                {cellPicked === activeCell.correctAnswer
                  ? `+${effectiveCellReward} pts!`
                  : `-${Math.round(activeCell.points / 2)} pts · Answer: ${activeCell.correctAnswer}`}
              </span>
              <button
                type="button"
                onClick={closeActiveCell}
                className="lt-press rounded-full bg-[#FF0000] px-5 py-2 text-[13px] font-bold text-white"
              >
                Back to Board
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 rounded-3xl border border-white/[0.08] bg-[#161619] p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
            <div className="flex items-center gap-2">
              <div
                className={`rounded-xl px-3.5 py-1.5 text-[13px] font-black ${
                  !twoPlayer || activePlayer === 0
                    ? 'bg-[#FF0000]/25 text-white ring-1 ring-[#FF0000]/50'
                    : 'bg-white/[0.04] text-[#AAAAAA]'
                }`}
              >
                {twoPlayer ? 'P1' : 'Score'}: {playerScores[0]}
              </div>
              {twoPlayer && (
                <div
                  className={`rounded-xl px-3.5 py-1.5 text-[13px] font-black ${
                    activePlayer === 1
                      ? 'bg-[#3EA6FF]/25 text-white ring-1 ring-[#3EA6FF]/50'
                      : 'bg-white/[0.04] text-[#AAAAAA]'
                  }`}
                >
                  P2: {playerScores[1]}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-[12px] font-semibold text-[#AAAAAA]">
                {Object.keys(solvedCells).length}/{totalBoardCells} played
              </span>
              <button
                type="button"
                onClick={restartJeopardy}
                className="lt-press inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-white/[0.16]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                New Board
              </button>
            </div>
          </div>

          {boardComplete ? (
            <div className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-8 text-center">
              <Trophy className="mx-auto h-12 w-12 text-amber-300" />
              <p className="text-[20px] font-black text-white">
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
                className="lt-press rounded-full bg-white px-6 py-2.5 text-[13px] font-bold text-black"
              >
                Generate Fresh Board
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {boardCategories.map((cat) => (
                <div key={cat.id} className="space-y-2.5">
                  <div className="flex min-h-[60px] flex-col items-center justify-center rounded-2xl border border-white/[0.12] bg-gradient-to-b from-blue-950/90 to-slate-900/95 px-2 py-2.5 text-center">
                    <p className="text-[12.5px] font-black leading-tight text-white">
                      {cat.title}
                    </p>
                    <p className="mt-0.5 text-[10.5px] font-semibold text-[#3EA6FF]">
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
                        className={`lt-press relative flex h-16 w-full items-center justify-center gap-1.5 rounded-2xl border text-[16px] font-black transition ${
                          status === 'right'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400/70'
                            : status === 'wrong'
                              ? 'border-rose-500/30 bg-rose-500/10 text-rose-400/70'
                              : 'border-amber-400/25 bg-gradient-to-b from-[#172554]/80 to-[#0f172a]/90 text-amber-300 shadow-md hover:border-amber-300/60 hover:brightness-125'
                        }`}
                      >
                        {status === 'right' ? (
                          <Check className="h-6 w-6" />
                        ) : status === 'wrong' ? (
                          <X className="h-6 w-6" />
                        ) : (
                          <>
                            <DiffIcon className={`h-3.5 w-3.5 ${diffStyle.iconClass}`} />
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

      {myListCount === 0 && onExplore && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-[#161619] px-4 py-3 text-[12px] text-[#AAAAAA]">
          <span>Subscribe to anime &amp; manga to unlock personalized My List quiz rounds.</span>
          <button
            type="button"
            onClick={onExplore}
            className="font-bold text-[#3EA6FF] hover:underline"
          >
            Browse Catalog &rarr;
          </button>
        </div>
      )}
    </div>
  );
};
