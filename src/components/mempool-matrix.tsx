"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MempoolSnapshot } from "@/lib/mempool";
import {
  createDrop,
  mergeTransactions,
  type MatrixDrop,
  type MempoolTransaction,
} from "@/lib/transactions";

const EMPTY: MempoolSnapshot = {
  transactions: [],
  stats: { count: 0, vsize: 0, totalFee: 0 },
  fetchedAt: "",
};

function formatCompact(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatBtc(sats: number) {
  return `${(sats / 100_000_000).toFixed(4)} BTC`;
}

export function MempoolMatrix() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dropsRef = useRef<MatrixDrop[]>([]);
  const transactionsRef = useRef<MempoolTransaction[]>([]);
  const pointerRef = useRef({ x: -1000, y: -1000 });
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [selected, setSelected] = useState<MempoolTransaction | null>(null);
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/mempool", { cache: "no-store" });
      if (!response.ok) throw new Error("offline");
      const next = (await response.json()) as MempoolSnapshot;
      transactionsRef.current = mergeTransactions(
        transactionsRef.current,
        next.transactions,
        140,
      );
      setSnapshot(next);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 2500);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    let frame = 0;
    let last = performance.now();

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * ratio);
      canvas.height = Math.floor(window.innerHeight * ratio);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      dropsRef.current = transactionsRef.current.map((transaction) =>
        createDrop(transaction, window.innerWidth, window.innerHeight),
      );
    };

    const render = (now: number) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;

      const gradient = context.createRadialGradient(
        width * 0.5,
        height * 0.35,
        0,
        width * 0.5,
        height * 0.35,
        Math.max(width, height) * 0.82,
      );
      gradient.addColorStop(0, "#07150f");
      gradient.addColorStop(0.42, "#020a06");
      gradient.addColorStop(1, "#010302");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      context.strokeStyle = "rgba(91, 255, 155, 0.025)";
      context.lineWidth = 1;
      const grid = width < 640 ? 32 : 48;
      for (let x = (frame * 0.12) % grid; x < width; x += grid) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }

      if (dropsRef.current.length !== transactionsRef.current.length) {
        const current = new Set(dropsRef.current.map((drop) => drop.txid));
        for (const transaction of transactionsRef.current) {
          if (!current.has(transaction.txid)) {
            dropsRef.current.push(createDrop(transaction, width, height));
          }
        }
        dropsRef.current = dropsRef.current.slice(-140);
      }

      context.textAlign = "center";
      context.textBaseline = "middle";
      for (const drop of dropsRef.current) {
        if (!paused) drop.y += drop.speed * dt;
        const bytes = drop.txid.match(/.{1,2}/g) ?? [];
        const charStep = drop.fontSize * 1.18;
        const visible = Math.min(bytes.length, 7 + drop.trailLength);
        const nearPointer = Math.hypot(drop.x - pointerRef.current.x, drop.y - pointerRef.current.y) < 70;
        context.font = `${nearPointer ? 700 : 500} ${drop.fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        context.shadowBlur = nearPointer ? 18 : 8;
        context.shadowColor = "rgba(70, 255, 135, .75)";
        for (let index = 0; index < visible; index += 1) {
          const fade = 1 - index / visible;
          context.fillStyle = index === 0
            ? `rgba(224, 255, 234, ${drop.opacity})`
            : `rgba(66, 255, 132, ${drop.opacity * fade * 0.72})`;
          context.fillText(bytes[index], drop.x, drop.y - index * charStep);
        }
        if (drop.y - visible * charStep > height + 40) {
          const fresh = createDrop(drop, width, height);
          drop.x = fresh.x;
          drop.y = -20;
        }
      }
      context.shadowBlur = 0;

      const scanY = (now * 0.035) % height;
      const scan = context.createLinearGradient(0, scanY - 50, 0, scanY + 50);
      scan.addColorStop(0, "rgba(0,255,120,0)");
      scan.addColorStop(0.5, "rgba(115,255,169,.045)");
      scan.addColorStop(1, "rgba(0,255,120,0)");
      context.fillStyle = scan;
      context.fillRect(0, scanY - 50, width, 100);

      frame += 1;
      frame = window.requestAnimationFrame(render);
    };

    const move = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const select = (event: PointerEvent) => {
      let closest: MatrixDrop | undefined;
      let distance = 90;
      for (const drop of dropsRef.current) {
        const nextDistance = Math.hypot(drop.x - event.clientX, drop.y - event.clientY);
        if (nextDistance < distance) {
          distance = nextDistance;
          closest = drop;
        }
      }
      if (closest) setSelected(closest);
    };

    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerdown", select);
    frame = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerdown", select);
    };
  }, [paused]);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#010302] text-emerald-50">
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" aria-label="Chuva de transações da mempool Bitcoin" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.34),transparent_25%,transparent_70%,rgba(0,0,0,.72))]" />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:p-7">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.26em] text-emerald-300/70 sm:text-xs">
            <span className={`size-1.5 rounded-full ${connected ? "animate-pulse bg-emerald-300" : "bg-amber-400"}`} />
            {connected ? "zero node · live" : "reconnecting"}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
            mempool<span className="text-emerald-400">.matrix</span>
          </h1>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-emerald-100/45 sm:text-sm">
            Cada coluna é uma transação esperando para entrar em um bloco.
          </p>
        </div>
        <button
          onClick={() => setPaused((value) => !value)}
          className="pointer-events-auto rounded-full border border-emerald-300/15 bg-black/35 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-200/70 backdrop-blur-md transition hover:border-emerald-300/40 hover:text-white sm:px-4"
        >
          {paused ? "resume" : "pause"}
        </button>
      </header>

      <section className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:p-7">
        {selected && (
          <button
            onClick={() => setSelected(null)}
            className="pointer-events-auto mb-3 w-full rounded-2xl border border-emerald-300/20 bg-[#021009]/90 p-4 text-left shadow-2xl shadow-emerald-950/40 backdrop-blur-xl sm:max-w-md"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-300/55">selected transaction · tap to close</div>
            <div className="mt-2 break-all font-mono text-xs text-emerald-100 sm:text-sm">{selected.txid}</div>
            <div className="mt-3 flex gap-4 font-mono text-xs text-emerald-200/65">
              <span>{selected.feeRate} sat/vB</span>
              <span>{formatBtc(selected.value)}</span>
              <span>{Math.round(selected.vsize)} vB</span>
            </div>
          </button>
        )}
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-emerald-300/10 bg-black/45 p-3 backdrop-blur-xl sm:max-w-xl sm:gap-4 sm:p-4">
          <Metric label="transactions" value={formatCompact(snapshot.stats.count)} />
          <Metric label="virtual size" value={`${(snapshot.stats.vsize / 1_000_000).toFixed(1)} MB`} />
          <Metric label="fees" value={`${formatCompact(snapshot.stats.totalFee)} sat`} />
        </div>
        <p className="mt-2 text-center font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-100/30 sm:max-w-xl sm:text-left">
          toque em uma transação para inspecionar · brilho e velocidade refletem fee rate
        </p>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-mono text-[8px] uppercase tracking-[0.16em] text-emerald-300/40 sm:text-[10px]">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-medium text-emerald-50 sm:text-lg">{value}</div>
    </div>
  );
}
