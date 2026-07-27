"use client";

import type { DataSourceSettingsController } from "@/hooks/use-data-source-settings";

export function DataSourceSettings({
  controller,
}: {
  controller: DataSourceSettingsController;
}) {
  const {
    status,
    token,
    baseUrl,
    label,
    loading,
    action,
    error,
    probe,
    canSave,
    setBaseUrl,
    setLabel,
    setToken,
    unlockSettings,
    testSource,
    saveSource,
  } = controller;

  const busy = action !== "idle";
  const editable = Boolean(status?.canConfigure);
  const saveEnabled = editable && !busy && canSave(baseUrl, label);

  return (
    <section className="mt-5 border-t border-emerald-300/10 pt-5" aria-labelledby="data-source-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div id="data-source-title" className="font-mono text-[10px] uppercase tracking-[.18em] text-emerald-300/70">
            fonte de dados
          </div>
          <p className="mt-1 text-xs leading-relaxed text-emerald-50/45">
            API REST compatível com mempool.space, terminando em /api.
          </p>
        </div>
        <div className="rounded-full border border-emerald-300/15 bg-black/40 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[.12em] text-emerald-100/55">
          {loading || !status
            ? "verificando"
            : `${status.host} · ${status.active ? "live" : "aguardando"}`}
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <label className="font-mono text-[9px] uppercase tracking-[.12em] text-emerald-300/50" htmlFor="mempool-source-url">
          URL da API
        </label>
        <input
          id="mempool-source-url"
          value={baseUrl}
          disabled={!editable}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="http://mempool-web:8080/api"
          inputMode="url"
          spellCheck={false}
          autoCapitalize="none"
          className="min-h-11 w-full rounded-xl border border-emerald-300/15 bg-black/60 px-3 font-mono text-xs text-emerald-50 outline-none placeholder:text-emerald-100/20 focus:border-emerald-300/45"
        />

        <label className="mt-1 font-mono text-[9px] uppercase tracking-[.12em] text-emerald-300/50" htmlFor="mempool-source-label">
          rótulo opcional
        </label>
        <input
          id="mempool-source-label"
          value={label}
          disabled={!editable}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="local node"
          maxLength={64}
          className="min-h-11 w-full rounded-xl border border-emerald-300/15 bg-black/60 px-3 font-mono text-xs text-emerald-50 outline-none placeholder:text-emerald-100/20 focus:border-emerald-300/45"
        />

        {status?.tokenRequired && (
          <>
            <label className="mt-1 font-mono text-[9px] uppercase tracking-[.12em] text-emerald-300/50" htmlFor="mempool-settings-token">
              token administrativo
            </label>
            <input
              id="mempool-settings-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Bearer token"
              autoComplete="off"
              spellCheck={false}
              className="min-h-11 w-full rounded-xl border border-emerald-300/15 bg-black/60 px-3 font-mono text-xs text-emerald-50 outline-none placeholder:text-emerald-100/20 focus:border-emerald-300/45"
            />
            <p className="font-mono text-[8px] uppercase tracking-[.1em] text-emerald-100/25">
              armazenado somente nesta sessão do navegador
            </p>
            {!status.canConfigure && (
              <button
                type="button"
                disabled={loading || !token}
                onClick={() => void unlockSettings()}
                className="min-h-11 rounded-xl border border-emerald-200/40 bg-emerald-300/15 px-3 font-mono text-[9px] uppercase tracking-[.12em] text-white disabled:cursor-not-allowed disabled:opacity-35"
              >
                {loading ? "desbloqueando…" : "desbloquear configurações"}
              </button>
            )}
          </>
        )}
      </div>

      {status?.readOnly && (
        <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2.5 font-mono text-[9px] leading-relaxed text-amber-100/75">
          Somente leitura. Configure MEMPOOL_SETTINGS_TOKEN ou, apenas em desenvolvimento confiável, MEMPOOL_ALLOW_UNAUTHENTICATED_SETTINGS=true.
        </p>
      )}

      {probe && (
        <div className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-300/5 px-3 py-2.5 font-mono text-[9px] text-emerald-100/70">
          compatível · {probe.latencyMs}ms · bloco {probe.summary.blockHeight}
        </div>
      )}
      {error && (
        <div role="alert" className="mt-3 rounded-xl border border-rose-300/20 bg-rose-300/5 px-3 py-2.5 font-mono text-[9px] text-rose-100/75">
          {error}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!editable || busy || !baseUrl.trim()}
          onClick={() => void testSource(baseUrl, label)}
          className="min-h-11 rounded-xl border border-emerald-300/20 bg-black/35 px-3 font-mono text-[9px] uppercase tracking-[.12em] text-emerald-100/65 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {action === "testing" ? "testando…" : "testar conexão"}
        </button>
        <button
          type="button"
          disabled={!saveEnabled}
          onClick={() => void saveSource(baseUrl, label)}
          className="min-h-11 rounded-xl border border-emerald-200/40 bg-emerald-300/15 px-3 font-mono text-[9px] uppercase tracking-[.12em] text-white disabled:cursor-not-allowed disabled:opacity-35"
        >
          {action === "saving" ? "salvando…" : "salvar fonte"}
        </button>
      </div>
    </section>
  );
}
