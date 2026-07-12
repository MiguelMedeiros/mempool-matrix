"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  blockAnimationProgress,
  classifyFee,
  detectBlockEvent,
  detectHighlights,
  getPressure,
  normalizeMode,
  parseMatrixCommand,
  parseTransactionSearch,
  snapshotRate,
  type MatrixCommand,
  type BlockSummary,
  type TransactionDetail,
  type VisualMode,
} from "@/lib/experience";
import type { MempoolSnapshot } from "@/lib/mempool";
import {
  createDrop,
  mergeTransactions,
  nextDropLifecycle,
  reflowDrops,
  shortTxid,
  visualDropLimit,
  type MatrixDrop,
  type MempoolTransaction,
} from "@/lib/transactions";

type EasterKind = MatrixCommand | "wake" | "deja-vu" | "kung-fu" | "knock" | "agent";
type EasterState = { kind: EasterKind; title: string; subtitle: string; until: number };

const EASTER_COPY: Record<EasterKind, [string, string]> = {
  rabbit: ["FOLLOW THE WHITE RABBIT", "The hash will show the way.  🐇"],
  spoon: ["THERE IS NO SPOON", "The mempool bends around you."],
  "red-pill": ["WELCOME TO THE REAL WORLD", "Priority vision unlocked."],
  "blue-pill": ["THE STORY ENDS", "Back to the ordinary mempool."],
  zion: ["WELCOME TO ZION", "The last human transaction city."],
  wake: ["WAKE UP, SATOSHI…", "THE MEMPOOL HAS YOU · FOLLOW THE HASH"],
  "deja-vu": ["DÉJÀ VU", "A GLITCH IN THE MEMPOOL · RBF DETECTED  🐈‍⬛"],
  "kung-fu": ["I KNOW KUNG FU", "Priority transaction detected."],
  knock: ["KNOCK, KNOCK, SATOSHI.", "A new block is entering the system."],
  agent: ["SYSTEM ANOMALY", "Extreme fee agent detected."],
};

const MODES: Array<{ id: VisualMode; label: string }> = [
  { id: "matrix", label: "matrix" },
  { id: "constellation", label: "constelação" },
  { id: "heatmap", label: "fees" },
  { id: "race", label: "block race" },
  { id: "ambient", label: "ambient" },
];

const EMPTY: MempoolSnapshot = {
  transactions: [],
  stats: { count: 0, vsize: 0, totalFee: 0 },
  fees: { fastestFee: 0, halfHourFee: 0, hourFee: 0, economyFee: 0, minimumFee: 0 },
  block: { height: 0, txCount: 0, size: 0, timestamp: 0 },
  fetchedAt: "",
};

function formatCompact(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatBtc(sats: number) {
  return `${(sats / 100_000_000).toFixed(4)} BTC`;
}

function timeAgo(timestamp: number) {
  if (!timestamp) return "—";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m`;
}

export function MempoolMatrix() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dropsRef = useRef<MatrixDrop[]>([]);
  const transactionsRef = useRef<MempoolTransaction[]>([]);
  const pointerRef = useRef({ x: -1000, y: -1000 });
  const previousRef = useRef<MempoolSnapshot | null>(null);
  const blockPulseRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const modeRef = useRef<VisualMode>("matrix");
  const pausedRef = useRef(false);
  const pressureRef = useRef(getPressure(0));
  const feesRef = useRef(EMPTY.fees);
  const focusedTxidRef = useRef<string | null>(null);
  const searchWasPausedRef = useRef(false);
  const searchedSelectionRef = useRef(false);
  const easterRef = useRef<EasterState | null>(null);
  const easterTimerRef = useRef<number | null>(null);
  const longPressRef = useRef<number | null>(null);
  const titleTapsRef = useRef<number[]>([]);

  const [snapshot, setSnapshot] = useState(EMPTY);
  const [selected, setSelected] = useState<MempoolTransaction | null>(null);
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState<VisualMode>("matrix");
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [blockEvent, setBlockEvent] = useState<BlockSummary | null>(null);
  const [arrivalRate, setArrivalRate] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pillOpen, setPillOpen] = useState(false);
  const [easter, setEaster] = useState<EasterState | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "invalid" | "not-found">("idle");

  const tone = useCallback((frequency: number, duration = 0.12, volume = 0.025) => {
    const audio = audioRef.current;
    if (!audio) return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + duration);
  }, []);

  const triggerEaster = useCallback((kind: EasterKind) => {
    const [title, subtitle] = EASTER_COPY[kind];
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 2500 : (kind === "red-pill" || kind === "zion" ? 20000 : kind === "spoon" ? 12000 : 6500);
    const next = { kind, title, subtitle, until: performance.now() + duration };
    easterRef.current = next;
    setEaster(next);
    if (easterTimerRef.current) window.clearTimeout(easterTimerRef.current);
    easterTimerRef.current = window.setTimeout(() => {
      easterRef.current = null;
      setEaster(null);
    }, duration);
    tone(kind === "red-pill" || kind === "agent" ? 110 : kind === "zion" ? 164 : 523, 0.28, 0.025);
  }, [tone]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/mempool", { cache: "no-store" });
      if (!response.ok) throw new Error("offline");
      const next = (await response.json()) as MempoolSnapshot;
      const previous = previousRef.current;
      const oldIds = new Set(transactionsRef.current.map((transaction) => transaction.txid));
      const newTransactions = next.transactions.filter((transaction) => !oldIds.has(transaction.txid));
      const newCount = newTransactions.length;

      transactionsRef.current = mergeTransactions(transactionsRef.current, next.transactions, 140);
      feesRef.current = next.fees;
      pressureRef.current = getPressure(next.stats.vsize);
      previousRef.current = next;
      setSnapshot(next);
      setConnected(true);
      window.localStorage.setItem("mempool-matrix-last", JSON.stringify(next));

      if (previous) {
        setArrivalRate(snapshotRate(
          { fetchedAt: previous.fetchedAt, count: previous.stats.count, vsize: previous.stats.vsize, blockHeight: previous.block.height },
          { fetchedAt: next.fetchedAt, count: next.stats.count, vsize: next.stats.vsize, blockHeight: next.block.height },
        ));
        const event = detectBlockEvent(previous.block.height, next.block);
        if (event) {
          blockPulseRef.current = performance.now();
          setBlockEvent(event);
          window.setTimeout(() => setBlockEvent(null), 6500);
          if (event.height % 3 === 0) triggerEaster("knock");
          else tone(73, 1.4, 0.08);
          if (navigator.vibrate) navigator.vibrate([80, 40, 160]);
        } else if (newCount > 0) {
          const extreme = newTransactions.find((transaction) => transaction.feeRate >= Math.max(100, next.fees.fastestFee * 4));
          if (extreme && !easterRef.current) triggerEaster(extreme.feeRate >= 200 ? "agent" : "kung-fu");
          else tone(380 + Math.min(500, newCount * 22), 0.06, 0.012);
        }
      }
    } catch {
      setConnected(false);
    }
  }, [tone, triggerEaster]);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      try {
        const cached = JSON.parse(window.localStorage.getItem("mempool-matrix-last") ?? "null") as MempoolSnapshot | null;
        if (cached?.transactions) {
          transactionsRef.current = cached.transactions;
          previousRef.current = cached;
          setSnapshot(cached);
        }
      } catch { /* ignore broken offline cache */ }
      if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      refresh();
    }, 0);
    const timer = window.setInterval(refresh, 2500);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    modeRef.current = mode;
    window.localStorage.setItem("mempool-matrix-mode", mode);
  }, [mode]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      setMode(normalizeMode(window.localStorage.getItem("mempool-matrix-mode")));
      const params = new URLSearchParams(window.location.search);
      if (params.get("search") === "1") setSearchOpen(true);
      if (params.get("settings") === "1") setSettingsOpen(true);
      const egg = params.get("egg");
      if (egg && egg in EASTER_COPY) triggerEaster(egg as EasterKind);
    }, 0);
    return () => window.clearTimeout(restore);
  }, [triggerEaster]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    let animationFrame = 0;
    let frame = 0;
    let last = performance.now();
    let viewport = { width: 0, height: 0 };

    const resize = () => {
      const nextViewport = { width: window.innerWidth, height: window.innerHeight };
      const ratio = Math.min(window.devicePixelRatio || 1, nextViewport.width < 640 ? 1.25 : 2);
      canvas.width = Math.floor(nextViewport.width * ratio);
      canvas.height = Math.floor(nextViewport.height * ratio);
      canvas.style.width = `${nextViewport.width}px`;
      canvas.style.height = `${nextViewport.height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      dropsRef.current = viewport.width > 0
        ? reflowDrops(dropsRef.current, viewport, nextViewport)
        : transactionsRef.current.slice(0, visualDropLimit(nextViewport.width)).map((transaction) => createDrop(transaction, nextViewport.width, nextViewport.height));
      viewport = nextViewport;
    };

    const render = (now: number) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      const pressure = pressureRef.current;
      const activeEaster = easterRef.current && easterRef.current.until > now ? easterRef.current.kind : null;
      drawBackground(context, width, height, frame, now, pressure.intensity, activeEaster);
      syncDrops(dropsRef.current, transactionsRef.current, width, height);

      const blockProgress = blockAnimationProgress(blockPulseRef.current, now);
      if (modeRef.current === "constellation") {
        drawConstellation(context, dropsRef.current, width, height, dt, frame, pausedRef.current);
      } else if (modeRef.current === "heatmap") {
        drawHeatmap(context, dropsRef.current, width, height, feesRef.current, frame);
      } else if (modeRef.current === "race") {
        drawRace(context, dropsRef.current, width, height, feesRef.current, frame, pausedRef.current);
      } else {
        drawMatrix(
          context,
          dropsRef.current,
          width,
          height,
          dt,
          pointerRef.current,
          pausedRef.current,
          modeRef.current === "ambient",
          feesRef.current,
          focusedTxidRef.current,
          activeEaster,
        );
      }
      if (blockProgress >= 0) drawBlockWave(context, width, height, blockProgress);
      animationFrame = window.requestAnimationFrame(render);
      frame += 1;
    };

    const move = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const select = (event: PointerEvent) => {
      let closest: MatrixDrop | undefined;
      let distance = 92;
      for (const drop of dropsRef.current) {
        const nextDistance = Math.hypot(drop.x - event.clientX, drop.y - event.clientY);
        if (nextDistance < distance) {
          distance = nextDistance;
          closest = drop;
        }
      }
      if (closest) void inspectTransaction(closest, setSelected, setDetail);
    };

    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerdown", select);
    animationFrame = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerdown", select);
    };
  }, []);

  const setVisualMode = (next: VisualMode) => {
    setMode(next);
    if (next === "ambient") setSelected(null);
  };

  const toggleAudio = async () => {
    if (!audioRef.current) audioRef.current = new AudioContext();
    if (audioRef.current.state === "suspended") await audioRef.current.resume();
    const enabled = !audioEnabled;
    setAudioEnabled(enabled);
    if (!enabled) {
      await audioRef.current.suspend();
    } else {
      tone(440, 0.08, 0.02);
    }
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
    else await document.exitFullscreen?.();
  };

  const searchTransaction = async (event?: FormEvent) => {
    event?.preventDefault();
    const command = parseMatrixCommand(searchQuery);
    if (command) {
      setSearchStatus("idle");
      setSearchOpen(false);
      setSearchQuery("");
      triggerEaster(command);
      return;
    }
    const txid = parseTransactionSearch(searchQuery);
    if (!txid) {
      setSearchStatus("invalid");
      return;
    }
    setSearchStatus("loading");
    try {
      const response = await fetch(`/api/tx/${txid}`, { cache: "no-store" });
      if (!response.ok) throw new Error("not-found");
      const found = await response.json() as TransactionDetail;
      const transaction: MempoolTransaction = {
        txid: found.txid,
        fee: found.fee,
        vsize: found.vsize,
        value: found.value,
        feeRate: found.feeRate,
      };
      searchWasPausedRef.current = pausedRef.current;
      searchedSelectionRef.current = true;
      setPaused(true);
      setMode("matrix");
      setSelected(transaction);
      setDetail(found);
      setSearchStatus("idle");
      setSearchOpen(false);
      focusedTxidRef.current = found.confirmed ? null : txid;
      if (!found.confirmed) {
        transactionsRef.current = mergeTransactions(transactionsRef.current, [transaction], 140);
        let drop = dropsRef.current.find((item) => item.txid === txid);
        if (!drop) {
          drop = createDrop(transaction, window.innerWidth, window.innerHeight);
          dropsRef.current.push(drop);
        }
        drop.x = window.innerWidth / 2;
        drop.y = Math.min(window.innerHeight * 0.48, window.innerHeight - 260);
        drop.phase = "falling";
        drop.phaseAge = 0;
      }
      tone(found.confirmed ? 220 : 660, 0.16, 0.025);
    } catch {
      setSearchStatus("not-found");
    }
  };

  const pasteSearch = async () => {
    try {
      const value = await navigator.clipboard.readText();
      setSearchQuery(value);
      setSearchStatus("idle");
    } catch {
      setSearchStatus("invalid");
    }
  };

  const closeInspector = () => {
    setSelected(null);
    setDetail(null);
    focusedTxidRef.current = null;
    if (searchedSelectionRef.current) setPaused(searchWasPausedRef.current);
    searchedSelectionRef.current = false;
  };

  const tapTitle = () => {
    const now = performance.now();
    titleTapsRef.current = titleTapsRef.current.filter((time) => now - time < 2600).concat(now);
    if (titleTapsRef.current.length === 3) triggerEaster("wake");
    if (titleTapsRef.current.length >= 7) {
      titleTapsRef.current = [];
      triggerEaster("zion");
    }
  };

  const startTitleHold = () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current);
    longPressRef.current = window.setTimeout(() => setPillOpen(true), 650);
  };

  const cancelTitleHold = () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current);
    longPressRef.current = null;
  };

  useEffect(() => {
    if (!detail?.rbf) return;
    const timer = window.setTimeout(() => triggerEaster("deja-vu"), 0);
    return () => window.clearTimeout(timer);
  }, [detail, triggerEaster]);

  const pressure = getPressure(snapshot.stats.vsize);
  const isAmbient = mode === "ambient";
  const highlights = detail ? detectHighlights(detail) : [];

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#010302] text-emerald-50">
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" aria-label="Visualização ao vivo da mempool Bitcoin" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.42),transparent_28%,transparent_68%,rgba(0,0,0,.78))]" />

      {blockEvent && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-emerald-950/10 px-5 backdrop-blur-[1px]">
          <div className="block-arrival w-full max-w-lg border-y border-emerald-200/40 bg-black/75 py-7 text-center shadow-[0_0_80px_rgba(80,255,145,.2)] backdrop-blur-xl">
            <div className="font-mono text-[10px] uppercase tracking-[.48em] text-emerald-300/70">new block mined</div>
            <div className="mt-3 font-mono text-4xl font-bold tracking-[-.07em] text-white sm:text-6xl">{blockEvent.height}</div>
            <div className="mt-3 flex justify-center gap-5 font-mono text-xs text-emerald-100/55">
              <span>{formatCompact(blockEvent.txCount)} txs</span>
              <span>{(blockEvent.size / 1_000_000).toFixed(2)} MB</span>
              <span>{timeAgo(blockEvent.timestamp)} ago</span>
            </div>
          </div>
        </div>
      )}

      {easter && (
        <div className={`pointer-events-none absolute inset-0 z-[60] flex items-center justify-center px-5 ${easter.kind === "red-pill" || easter.kind === "agent" ? "bg-red-950/15" : easter.kind === "zion" ? "bg-amber-950/15" : ""}`}>
          {easter.kind === "rabbit" && <div className="matrix-rabbit absolute bottom-[30%] font-mono text-4xl">🐇</div>}
          <div className="matrix-easter max-w-xl border-y border-emerald-200/25 bg-black/70 px-6 py-6 text-center backdrop-blur-md">
            <div className={`font-mono text-xl font-bold tracking-[.08em] sm:text-3xl ${easter.kind === "red-pill" || easter.kind === "agent" ? "text-red-300" : easter.kind === "zion" ? "text-amber-300" : "text-emerald-200"}`}>{easter.title}</div>
            <div className="mt-3 font-mono text-[11px] uppercase tracking-[.16em] text-white/55 sm:text-sm">{easter.subtitle}</div>
          </div>
        </div>
      )}

      {pillOpen && (
        <div className="tx-search-overlay flex items-center justify-center bg-black/75 px-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/90 p-6 text-center">
            <div className="font-mono text-sm uppercase tracking-[.2em] text-white/60">This is your last chance.</div>
            <div className="mt-6 grid grid-cols-2 gap-4">
              <button onClick={() => { setPillOpen(false); triggerEaster("red-pill"); }} className="min-h-24 rounded-full border border-red-300/40 bg-red-500/15 font-mono text-sm uppercase tracking-[.15em] text-red-200">red pill</button>
              <button onClick={() => { setPillOpen(false); triggerEaster("blue-pill"); }} className="min-h-24 rounded-full border border-sky-300/40 bg-sky-500/15 font-mono text-sm uppercase tracking-[.15em] text-sky-200">blue pill</button>
            </div>
            <button onClick={() => setPillOpen(false)} className="mt-5 font-mono text-xs uppercase text-white/35">cancel</button>
          </div>
        </div>
      )}

      {searchOpen && (
        <div className="tx-search-overlay bg-black/60 backdrop-blur-sm">
          <form onSubmit={searchTransaction} className="tx-search-sheet border border-emerald-300/20 bg-[#021009]/98 p-4 shadow-[0_0_80px_rgba(40,255,120,.12)] sm:p-5">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-[11px] uppercase tracking-[.18em] text-emerald-300/70">transaction search</div>
                <div className="mt-1.5 text-base leading-snug text-emerald-50/85">Cole um TXID ou uma URL do explorador.</div>
              </div>
              <button type="button" onClick={() => setSearchOpen(false)} className="shrink-0 rounded-full border border-emerald-300/15 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[.12em] text-emerald-100/55">close</button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 sm:flex-nowrap">
              <input
                value={searchQuery}
                onChange={(event) => { setSearchQuery(event.target.value); setSearchStatus("idle"); }}
                placeholder="TXID ou URL do explorador"
                spellCheck={false}
                autoCapitalize="none"
                className="min-w-0 basis-full flex-1 rounded-xl border border-emerald-300/15 bg-black/60 px-3 py-3 font-mono text-base text-emerald-50 outline-none placeholder:text-emerald-100/20 focus:border-emerald-300/45 sm:basis-auto sm:text-xs"
              />
              <button type="button" onClick={pasteSearch} className="min-h-11 flex-1 rounded-xl border border-emerald-300/15 bg-emerald-300/5 px-3 font-mono text-[9px] uppercase tracking-[.14em] text-emerald-200/65 sm:flex-none">paste</button>
              <button disabled={searchStatus === "loading"} className="min-h-11 flex-1 rounded-xl border border-emerald-200/40 bg-emerald-300/15 px-4 font-mono text-[9px] uppercase tracking-[.14em] text-white disabled:opacity-50 sm:flex-none">{searchStatus === "loading" ? "finding" : "find"}</button>
            </div>
            {searchStatus === "invalid" && <p className="mt-3 font-mono text-[10px] text-amber-200/75">Informe um TXID válido com 64 caracteres hexadecimais.</p>}
            {searchStatus === "not-found" && <p className="mt-3 font-mono text-[10px] text-rose-200/75">Transação não encontrada no nosso node.</p>}
          </form>
        </div>
      )}

      {settingsOpen && (
        <div className="tx-search-overlay bg-black/60 backdrop-blur-sm">
          <div className="tx-search-sheet border border-emerald-300/20 bg-[#021009]/98 p-4 shadow-[0_0_80px_rgba(40,255,120,.12)] sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[.18em] text-emerald-300/70">configurações</div>
                <div className="mt-1.5 text-base text-emerald-50/85">Visual e áudio da experiência.</div>
              </div>
              <button type="button" onClick={() => setSettingsOpen(false)} className="shrink-0 rounded-full border border-emerald-300/15 px-3 py-2 font-mono text-[10px] uppercase text-emerald-100/65">fechar</button>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {MODES.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { setVisualMode(item.id); setSettingsOpen(false); }}
                  className={`flex min-h-14 items-center justify-between rounded-xl border px-4 text-left font-mono text-sm uppercase tracking-[.1em] ${mode === item.id ? "border-emerald-200/50 bg-emerald-300/15 text-white" : "border-emerald-300/10 bg-black/30 text-emerald-100/65"}`}
                >
                  {item.label}<span className="text-emerald-300/55">{mode === item.id ? "●" : "○"}</span>
                </button>
              ))}
            </div>
            <button onClick={toggleAudio} className="mt-4 flex min-h-14 w-full items-center justify-between rounded-xl border border-emerald-300/15 bg-black/35 px-4 font-mono text-sm uppercase tracking-[.1em] text-emerald-50/80">
              <span>som ambiente</span>
              <span className={`rounded-full px-3 py-1 text-xs ${audioEnabled ? "bg-emerald-300/20 text-emerald-100" : "bg-white/5 text-white/40"}`}>{audioEnabled ? "ligado" : "desligado"}</span>
            </button>
          </div>
        </div>
      )}

      {isAmbient ? (
        <button onClick={() => setVisualMode("matrix")} className="absolute right-3 top-[max(.75rem,env(safe-area-inset-top))] z-40 rounded-full border border-emerald-300/15 bg-black/30 px-3 py-2 font-mono text-[9px] uppercase tracking-[.2em] text-emerald-100/45 backdrop-blur-md">exit ambient</button>
      ) : (
        <>
          <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:p-7">
            <div>
              <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-emerald-300/80 sm:tracking-[0.26em]">
                <span className={`size-2 rounded-full ${connected ? "animate-pulse bg-emerald-300" : "bg-amber-400"}`} />
                {connected ? "zero node · live" : "offline cache · reconnecting"}
              </div>
              <button
                onClick={tapTitle}
                onPointerDown={startTitleHold}
                onPointerUp={cancelTitleHold}
                onPointerCancel={cancelTitleHold}
                onPointerLeave={cancelTitleHold}
                className="pointer-events-auto mt-2 block select-none text-left text-[32px] font-semibold leading-none tracking-[-0.05em] text-white sm:text-4xl"
              >mempool<span className="text-emerald-400">.matrix</span></button>
              <div className="mt-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.11em] text-emerald-100/60 sm:mt-1 sm:text-xs sm:tracking-[.14em]">
                <span>pressure</span>
                <span className={`rounded-full border px-2 py-0.5 ${pressureClass(pressure.label)}`}>{pressure.label}</span>
                <span>{arrivalRate > 0 ? `+${arrivalRate} tx/s` : "sampling"}</span>
              </div>
            </div>
            <div className="pointer-events-auto hidden gap-2 sm:flex">
              <ControlButton label="search tx" onClick={() => { setSearchOpen(true); setSearchStatus("idle"); }} />
              <ControlButton label="settings" onClick={() => setSettingsOpen(true)} />
              <ControlButton label={paused ? "resume" : "pause"} onClick={() => setPaused((value) => !value)} />
              <ControlButton label="fullscreen" onClick={toggleFullscreen} />
            </div>
          </header>

          <div
            className="pointer-events-auto z-50 grid grid-cols-2 gap-2 sm:hidden"
            style={{ position: "fixed", left: "min(calc(100vw - 108px), 282px)", top: 12, width: 96 }}
          >
            <ControlButton label="search tx" mobileLabel={<SearchIcon />} onClick={() => { setSearchOpen(true); setSearchStatus("idle"); }} />
            <ControlButton label="settings" mobileLabel={<SettingsIcon />} onClick={() => setSettingsOpen(true)} />
            <ControlButton label={paused ? "resume" : "pause"} mobileLabel={paused ? "▶" : "Ⅱ"} onClick={() => setPaused((value) => !value)} />
            <ControlButton label="fullscreen" mobileLabel="⛶" onClick={toggleFullscreen} />
          </div>

          <section className="pointer-events-none absolute bottom-0 left-0 z-20 w-[384px] max-w-[100vw] p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:inset-x-0 sm:w-auto sm:max-w-none sm:p-7">
            {selected && (
              <div className="pointer-events-auto mb-3 w-full max-w-lg rounded-2xl border border-emerald-300/20 bg-[#021009]/95 p-4 shadow-2xl shadow-emerald-950/50 backdrop-blur-xl">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.22em] text-emerald-300/55">
                    transaction inspector
                    {detail && <span className={`rounded-full border px-2 py-0.5 text-[7px] ${detail.confirmed ? "border-sky-300/25 bg-sky-300/10 text-sky-100" : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"}`}>{detail.confirmed ? `confirmed · block ${detail.blockHeight}` : "in mempool"}</span>}
                  </div>
                  <button onClick={closeInspector} className="font-mono text-xs text-emerald-100/45">close</button>
                </div>
                <div className="mt-2 break-all font-mono text-[11px] text-emerald-50 sm:text-xs">{selected.txid}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  <TinyMetric label="fee rate" value={`${detail?.feeRate ?? selected.feeRate} sat/vB`} />
                  <TinyMetric label="value" value={formatBtc(detail?.value ?? selected.value)} />
                  <TinyMetric label="vsize" value={`${detail?.vsize ?? Math.round(selected.vsize)} vB`} />
                  <TinyMetric label="inputs" value={detail ? String(detail.inputs) : "…"} />
                  <TinyMetric label="outputs" value={detail ? String(detail.outputs) : "…"} />
                  <TinyMetric label="RBF" value={detail ? (detail.rbf ? "yes" : "no") : "…"} />
                </div>
                {detail?.confirmed && <div className="mt-3 font-mono text-[9px] uppercase tracking-[.14em] text-sky-100/55">confirmed {timeAgo(detail.blockTime ?? 0)} ago · block {detail.blockHeight}</div>}
                {highlights.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{highlights.map((highlight) => <span key={highlight} className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-1 font-mono text-[8px] uppercase tracking-[.15em] text-amber-100">⚡ {highlight}</span>)}</div>}
                <a href={`/explorer/tx/${selected.txid}`} target="_blank" rel="noreferrer" className="mt-3 inline-block font-mono text-[9px] uppercase tracking-[.18em] text-emerald-300/70 underline decoration-emerald-400/30 underline-offset-4">open in our explorer ↗</a>
              </div>
            )}

            <div className="grid grid-cols-3 gap-x-3 gap-y-4 rounded-2xl border border-emerald-300/15 bg-black/70 p-4 backdrop-blur-xl sm:max-w-3xl sm:grid-cols-5 sm:gap-4">
              <Metric label="transactions" value={formatCompact(snapshot.stats.count)} />
              <Metric label="virtual size" value={`${(snapshot.stats.vsize / 1_000_000).toFixed(1)} MB`} />
              <Metric label="next block" value={`${snapshot.fees.fastestFee} sat/vB`} />
              <Metric label="height" value={String(snapshot.block.height || "—")} />
              <Metric label="last block" value={timeAgo(snapshot.block.timestamp)} />
              <Metric label="arrival rate" value={arrivalRate > 0 ? `${arrivalRate} tx/s` : "sampling"} />
            </div>
          </section>
        </>
      )}
    </main>
  );
}

async function inspectTransaction(
  transaction: MempoolTransaction,
  setSelected: (transaction: MempoolTransaction) => void,
  setDetail: (detail: TransactionDetail | null) => void,
) {
  setSelected(transaction);
  setDetail(null);
  try {
    const response = await fetch(`/api/tx/${transaction.txid}`, { cache: "no-store" });
    if (response.ok) setDetail(await response.json() as TransactionDetail);
  } catch { /* summary remains available */ }
}

function syncDrops(drops: MatrixDrop[], transactions: MempoolTransaction[], width: number, height: number) {
  const limit = visualDropLimit(width);
  const retained = new Set(transactions.map((transaction) => transaction.txid));
  for (let index = drops.length - 1; index >= 0; index -= 1) {
    if (!retained.has(drops[index].txid)) drops.splice(index, 1);
  }
  const current = new Set(drops.map((drop) => drop.txid));
  for (const transaction of transactions) {
    if (drops.length >= limit) break;
    if (!current.has(transaction.txid)) {
      drops.push(createDrop(transaction, width, height));
      current.add(transaction.txid);
    }
  }
  if (drops.length > limit) drops.splice(0, drops.length - limit);
}

function drawBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: number,
  now: number,
  intensity: number,
  easter: EasterKind | null,
) {
  const gradient = context.createRadialGradient(width * 0.5, height * 0.32, 0, width * 0.5, height * 0.32, Math.max(width, height) * 0.9);
  if (easter === "red-pill" || easter === "agent") {
    gradient.addColorStop(0, "#280507"); gradient.addColorStop(0.55, "#0b0203"); gradient.addColorStop(1, "#010101");
  } else if (easter === "zion") {
    gradient.addColorStop(0, "#251405"); gradient.addColorStop(0.55, "#0c0702"); gradient.addColorStop(1, "#020101");
  } else {
    gradient.addColorStop(0, `rgb(${4 + intensity * 7}, ${17 + intensity * 12}, ${10 + intensity * 7})`);
    gradient.addColorStop(0.5, "#020a06");
    gradient.addColorStop(1, "#010302");
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = `rgba(91,255,155,${0.018 + intensity * 0.035})`;
  context.lineWidth = 1;
  const grid = width < 640 ? 32 : 48;
  for (let x = (frame * (0.08 + intensity * 0.2)) % grid; x < width; x += grid) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
  }
  const scanY = (now * (0.025 + intensity * 0.03)) % height;
  const scan = context.createLinearGradient(0, scanY - 60, 0, scanY + 60);
  scan.addColorStop(0, "rgba(0,255,120,0)"); scan.addColorStop(0.5, `rgba(115,255,169,${0.025 + intensity * 0.05})`); scan.addColorStop(1, "rgba(0,255,120,0)");
  context.fillStyle = scan; context.fillRect(0, scanY - 60, width, 120);
}

function drawMatrix(
  context: CanvasRenderingContext2D,
  drops: MatrixDrop[],
  width: number,
  height: number,
  dt: number,
  pointer: { x: number; y: number },
  paused: boolean,
  ambient: boolean,
  fees: MempoolSnapshot["fees"],
  focusedTxid: string | null,
  easter: EasterKind | null,
) {
  context.textAlign = "center"; context.textBaseline = "middle";
  const mobile = width < 640;
  const floorY = ambient ? height - 28 : height - (mobile ? 182 : 112);
  for (const drop of drops) {
    if (!paused) {
      const resetY = -80 - ((drop.x + drop.cycle * 97) % Math.max(140, height * 0.55));
      const next = nextDropLifecycle(drop, dt * (ambient ? 0.72 : 1), floorY, resetY);
      drop.phase = next.phase;
      drop.phaseAge = next.phaseAge;
      drop.y = next.y;
      drop.cycle = next.cycle;
    }
    const renderX = easter === "spoon"
      ? drop.x + Math.sin(drop.y * 0.018 + performance.now() * 0.003) * (mobile ? 22 : 42)
      : drop.x;
    const bytes = drop.txid.match(/.{1,2}/g) ?? [];
    const visible = Math.min(bytes.length, 7 + drop.trailLength);
    const charStep = drop.fontSize * 1.18;
    const focused = drop.txid === focusedTxid;
    const near = focused || Math.hypot(renderX - pointer.x, drop.y - pointer.y) < 70;
    const palette = feePalette(classifyFee(drop.feeRate, fees));
    if (focused) drawSearchBeam(context, renderX, drop.y, floorY, palette.dot);
    context.font = `${near ? 700 : 500} ${focused ? drop.fontSize * 1.18 : drop.fontSize}px ui-monospace, monospace`;
    context.shadowBlur = focused ? (mobile ? 14 : 28) : mobile ? 0 : near ? 18 : palette.glow;
    context.shadowColor = palette.shadow;

    if (drop.phase === "dissolve") {
      drawTxDissolve(context, renderX === drop.x ? drop : { ...drop, x: renderX }, bytes, visible, charStep, palette);
      continue;
    }

    const impactProgress = drop.phase === "impact" ? Math.min(1, drop.phaseAge / 0.32) : 0;
    const compression = drop.phase === "impact"
      ? 1 - Math.sin(impactProgress * Math.PI) * 0.72
      : 1;
    for (let index = 0; index < visible; index += 1) {
      const fade = 1 - index / visible;
      context.fillStyle = index === 0 ? palette.head : palette.trail(fade * drop.opacity);
      context.fillText(bytes[index], renderX, drop.y - index * charStep * compression);
    }
    if (drop.feeRate >= Math.max(200, fees.fastestFee * 5)) {
      context.save();
      context.font = "700 8px ui-monospace, monospace";
      context.fillStyle = "rgba(255,90,90,.85)";
      context.fillText("AGENT", renderX, drop.y + 15);
      context.restore();
    }
    if (drop.phase === "impact") drawTxRipple(context, renderX, floorY, impactProgress, palette.dot);
  }
  context.shadowBlur = 0;
}

function drawSearchBeam(context: CanvasRenderingContext2D, x: number, y: number, floorY: number, color: string) {
  const pulse = 0.5 + Math.sin(performance.now() * 0.006) * 0.5;
  context.save();
  const beam = context.createLinearGradient(x - 46, 0, x + 46, 0);
  beam.addColorStop(0, "rgba(80,255,145,0)");
  beam.addColorStop(0.5, `rgba(120,255,170,${0.08 + pulse * 0.05})`);
  beam.addColorStop(1, "rgba(80,255,145,0)");
  context.fillStyle = beam;
  context.fillRect(x - 46, 0, 92, floorY);
  context.strokeStyle = color;
  context.globalAlpha = 0.45 + pulse * 0.35;
  context.lineWidth = 1.5;
  context.shadowBlur = 24;
  context.shadowColor = color;
  context.beginPath();
  context.ellipse(x, y, 30 + pulse * 12, 10 + pulse * 4, 0, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawTxRipple(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  color: string,
) {
  context.save();
  context.globalAlpha = Math.max(0, 0.8 * (1 - progress));
  context.strokeStyle = color;
  context.lineWidth = 1.5;
  context.shadowBlur = 18;
  context.shadowColor = color;
  context.beginPath();
  context.ellipse(x, y, 10 + progress * 74, 2 + progress * 10, 0, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawTxDissolve(
  context: CanvasRenderingContext2D,
  drop: MatrixDrop,
  bytes: string[],
  visible: number,
  charStep: number,
  palette: ReturnType<typeof feePalette>,
) {
  const progress = Math.min(1, drop.phaseAge / 0.72);
  const eased = 1 - Math.pow(1 - progress, 3);
  drawTxRipple(context, drop.x, drop.y, Math.min(1, 0.25 + progress), palette.dot);
  context.save();
  context.globalAlpha = Math.max(0, 1 - progress);
  for (let index = 0; index < visible; index += 1) {
    const seed = Number.parseInt(drop.txid.slice(index * 2, index * 2 + 2), 16) / 255;
    const angle = seed * Math.PI * 2 + index * 0.7;
    const distance = eased * (22 + index * 4);
    const x = drop.x + Math.cos(angle) * distance;
    const y = drop.y - index * charStep * (1 - eased) + Math.sin(angle) * distance + eased * eased * 32;
    context.save();
    context.translate(x, y);
    context.rotate((seed - 0.5) * eased * 1.8);
    context.fillStyle = index === 0 ? palette.head : palette.trail((1 - progress) * drop.opacity);
    context.fillText(bytes[index], 0, 0);
    context.restore();
  }
  if (progress > 0.32 && progress < 0.72 && Number.parseInt(drop.txid.slice(0, 2), 16) % 11 === 0) {
    const words = ["NEO", "TRINITY", "MORPHEUS", "ZION"];
    const word = words[Number.parseInt(drop.txid.slice(2, 4), 16) % words.length];
    context.font = "700 11px ui-monospace, monospace";
    context.fillStyle = palette.head;
    context.fillText(word, drop.x, drop.y - 22);
  }
  context.restore();
}

function drawConstellation(context: CanvasRenderingContext2D, drops: MatrixDrop[], width: number, height: number, dt: number, frame: number, paused: boolean) {
  const visible = drops.slice(-70);
  for (const drop of visible) {
    if (!paused) drop.y += drop.speed * dt * 0.28;
    if (drop.y > height + 20) drop.y = -20;
  }
  context.lineWidth = 0.7;
  for (let index = 1; index < visible.length; index += 1) {
    const a = visible[index - 1]; const b = visible[index];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (distance < 180) {
      context.strokeStyle = `rgba(70,255,140,${0.16 * (1 - distance / 180)})`;
      context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
    }
  }
  for (const drop of visible) {
    const pulse = 2.5 + Math.sin(frame * 0.03 + drop.x) * 1.3;
    context.fillStyle = "rgba(110,255,164,.72)"; context.shadowBlur = 13; context.shadowColor = "#30ff78";
    context.beginPath(); context.arc(drop.x, drop.y, pulse, 0, Math.PI * 2); context.fill();
    if (width > 720) {
      context.shadowBlur = 0; context.fillStyle = "rgba(190,255,211,.32)"; context.font = "9px ui-monospace,monospace"; context.textAlign = "left";
      context.fillText(shortTxid(drop.txid, 10), drop.x + 7, drop.y + 2);
    }
  }
  context.shadowBlur = 0;
}

function drawHeatmap(context: CanvasRenderingContext2D, drops: MatrixDrop[], width: number, height: number, fees: MempoolSnapshot["fees"], frame: number) {
  const tiers = ["low", "medium", "high", "priority", "extreme"] as const;
  const groups = tiers.map((tier) => drops.filter((drop) => classifyFee(drop.feeRate, fees) === tier));
  const top = Math.min(190, height * 0.25); const available = height - top - 120; const column = width / tiers.length;
  groups.forEach((group, tierIndex) => {
    const palette = feePalette(tiers[tierIndex]);
    const barHeight = Math.min(available, 32 + group.length * 8);
    const x = tierIndex * column + column * 0.15; const y = top + available - barHeight;
    context.fillStyle = palette.bar; context.shadowBlur = 20; context.shadowColor = palette.shadow;
    context.fillRect(x, y, column * 0.7, barHeight);
    context.shadowBlur = 0; context.fillStyle = "rgba(220,255,230,.62)"; context.font = `${width < 640 ? 8 : 11}px ui-monospace,monospace`; context.textAlign = "center";
    context.fillText(tiers[tierIndex], x + column * 0.35, top + available + 22);
    context.fillText(`${group.length} tx`, x + column * 0.35, y - 12);
    group.slice(0, 18).forEach((drop, index) => {
      context.fillStyle = palette.dot; const jitter = Math.sin(frame * 0.02 + index * 8) * column * 0.08;
      context.fillRect(x + column * 0.35 + jitter, top + available - 8 - index * Math.max(5, barHeight / 20), 2, 2);
    });
  });
}

function drawRace(context: CanvasRenderingContext2D, drops: MatrixDrop[], width: number, height: number, fees: MempoolSnapshot["fees"], frame: number, paused: boolean) {
  const racers = drops.slice(-18); const top = Math.min(190, height * 0.24); const laneHeight = Math.max(18, Math.min(34, (height - top - 110) / racers.length));
  racers.forEach((drop, index) => {
    const palette = feePalette(classifyFee(drop.feeRate, fees));
    const progress = ((drop.x + (paused ? 0 : frame * drop.speed * 0.018)) % (width + 180)) - 90;
    const y = top + index * laneHeight;
    context.strokeStyle = "rgba(80,255,145,.07)"; context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
    context.fillStyle = palette.dot; context.shadowBlur = palette.glow; context.shadowColor = palette.shadow; context.font = `${width < 640 ? 9 : 11}px ui-monospace,monospace`; context.textAlign = "left";
    context.fillText(`${shortTxid(drop.txid, width < 640 ? 8 : 12)}  ${drop.feeRate} sat/vB`, progress, y - 4);
  });
  context.shadowBlur = 0;
  context.fillStyle = "rgba(220,255,232,.32)"; context.font = "9px ui-monospace,monospace"; context.textAlign = "right"; context.fillText("NEXT BLOCK →", width - 18, top - 20);
}

function drawBlockWave(context: CanvasRenderingContext2D, width: number, height: number, progress: number) {
  const eased = 1 - Math.pow(1 - Math.min(1, progress * 1.4), 3); const y = height * (1 - eased);
  context.strokeStyle = `rgba(180,255,205,${1 - progress})`; context.lineWidth = 2; context.shadowBlur = 28; context.shadowColor = "#50ff8c";
  context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); context.shadowBlur = 0;
}

function feePalette(tier: ReturnType<typeof classifyFee>) {
  const palettes = {
    low: { head: "rgba(130,255,169,.72)", shadow: "#0d7f42", glow: 5, bar: "rgba(34,130,72,.34)", dot: "#42d47c", trail: (a: number) => `rgba(38,170,91,${a * 0.5})` },
    medium: { head: "rgba(211,255,224,.88)", shadow: "#38ff82", glow: 8, bar: "rgba(55,215,112,.42)", dot: "#70ff9e", trail: (a: number) => `rgba(66,255,132,${a * 0.65})` },
    high: { head: "rgba(245,255,247,.96)", shadow: "#9affbd", glow: 12, bar: "rgba(132,255,171,.5)", dot: "#d4ffe0", trail: (a: number) => `rgba(130,255,170,${a * 0.75})` },
    priority: { head: "rgba(255,248,193,1)", shadow: "#ffe06a", glow: 16, bar: "rgba(255,214,73,.55)", dot: "#ffe871", trail: (a: number) => `rgba(255,222,91,${a * 0.72})` },
    extreme: { head: "rgba(255,219,219,1)", shadow: "#ff3d65", glow: 22, bar: "rgba(255,54,91,.6)", dot: "#ff8a9f", trail: (a: number) => `rgba(255,55,95,${a * 0.78})` },
  };
  return palettes[tier];
}

function pressureClass(label: ReturnType<typeof getPressure>["label"]) {
  return {
    calm: "border-emerald-300/20 bg-emerald-300/10 text-emerald-200",
    active: "border-lime-300/25 bg-lime-300/10 text-lime-100",
    heavy: "border-amber-300/30 bg-amber-300/10 text-amber-100",
    critical: "border-rose-300/35 bg-rose-400/15 text-rose-100",
  }[label];
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 5 5" /></svg>;
}

function SettingsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" /></svg>;
}

function ControlButton({ label, mobileLabel, onClick, active = false }: { label: string; mobileLabel?: ReactNode; onClick: () => void; active?: boolean }) {
  return <button aria-label={label} onClick={onClick} className={`min-h-11 min-w-11 rounded-full border px-3 py-2 font-mono text-base uppercase leading-none tracking-[.1em] backdrop-blur-md transition sm:min-h-0 sm:min-w-9 sm:text-[9px] sm:tracking-[.16em] ${active ? "border-emerald-200/50 bg-emerald-300/15 text-white" : "border-emerald-300/15 bg-black/35 text-emerald-200/65 hover:border-emerald-300/40"}`}><span className="sm:hidden">{mobileLabel ?? label}</span><span className="hidden sm:inline">{label}</span></button>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><div className="truncate font-mono text-[9px] uppercase tracking-[0.09em] text-emerald-300/60">{label}</div><div className="mt-1.5 truncate font-mono text-[15px] font-semibold text-emerald-50 sm:text-base">{value}</div></div>;
}

function TinyMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-emerald-300/10 bg-black/30 p-2.5"><div className="font-mono text-[9px] uppercase tracking-[.1em] text-emerald-300/55">{label}</div><div className="mt-1.5 truncate font-mono text-sm text-emerald-50/90">{value}</div></div>;
}
