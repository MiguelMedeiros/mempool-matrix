import Link from "next/link";
import { CopyValueButton } from "@/components/copy-value-button";
import { FieldLabel } from "@/components/info-tip";
import { detectHighlights } from "@/lib/experience";
import type {
  TransactionDetail,
  TransactionInput,
  TransactionOutput,
  TransactionScript,
} from "@/lib/transaction-detail";
import type { TransactionEducationKey } from "@/lib/transaction-education";

export function TransactionDetailPage({ detail }: { detail: TransactionDetail }) {
  const highlights = detectHighlights(detail);
  const feeEquationMatches = !detail.isCoinbase
    && Math.abs(detail.inputValue - detail.outputValue - detail.fee) < 1;

  return (
    <main className="relative h-dvh w-full overflow-y-auto bg-[#010302] text-emerald-50">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(24,110,61,.22),transparent_42%),linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.72))]" />
      <div className="pointer-events-none fixed inset-0 opacity-20 [background-image:linear-gradient(rgba(80,255,145,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(80,255,145,.035)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative mx-auto w-full max-w-7xl px-4 pb-20 pt-[max(1rem,env(safe-area-inset-top))] sm:px-7 sm:pt-7">
        <header className="flex flex-col gap-5 border-b border-emerald-300/15 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.24em] text-emerald-300/60">
              <span className={`size-2 rounded-full ${detail.confirmed ? "bg-sky-300" : "animate-pulse bg-emerald-300"}`} />
              {detail.confirmed ? "confirmed transaction" : "live in mempool"}
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.055em] text-white sm:text-5xl">
              mempool<span className="text-emerald-400">.transaction</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-emerald-50/45">
              Follow the value, inspect every script, and learn how this transaction moves through Bitcoin.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/stats" className={navClass}>statistics</Link>
            <Link href="/" className={primaryNavClass}>← matrix</Link>
          </div>
        </header>

        <section className="mt-6 rounded-2xl border border-emerald-300/20 bg-[#021009]/92 p-4 shadow-[0_0_80px_rgba(40,255,120,.08)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge confirmed={detail.confirmed} />
            {detail.isCoinbase && <Badge tone="amber">coinbase</Badge>}
            {detail.rbf && <Badge tone="amber">RBF enabled</Badge>}
            {detail.hasWitness && <Badge tone="emerald">segwit witness</Badge>}
            {highlights.map((highlight) => <Badge key={highlight} tone="amber">⚡ {highlight}</Badge>)}
          </div>

          <div className="mt-5">
            <FieldLabel field="txid">transaction id</FieldLabel>
            <div className="mt-2 flex items-start gap-3 rounded-xl border border-emerald-300/10 bg-black/35 p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-emerald-50/90 sm:text-sm">
                {detail.txid}
              </code>
              <CopyValueButton value={detail.txid} label="copy txid" />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <SummaryMetric field="feeRate" label="fee rate" value={`${detail.feeRate.toFixed(1)} sat/vB`} />
            <SummaryMetric field="fee" label="fee" value={formatSats(detail.fee)} />
            <SummaryMetric field="vsize" label="virtual size" value={`${formatNumber(detail.vsize)} vB`} />
            <SummaryMetric field="weight" label="weight" value={`${formatNumber(detail.weight)} WU`} />
            <SummaryMetric field="totalOutput" label="sent to outputs" value={formatBtc(detail.outputValue)} />
            <SummaryMetric field="inputs" label="inputs" value={formatNumber(detail.inputs)} />
            <SummaryMetric field="outputs" label="outputs" value={formatNumber(detail.outputs)} />
            <SummaryMetric field="rbf" label="replaceable" value={detail.rbf ? "yes" : "no"} />
          </div>
        </section>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className={cardClass}>
            <SectionHeading
              eyebrow="value flow"
              title="Inputs fund outputs"
              description="Bitcoin tracks spendable outputs, not account balances. This transaction consumes old outputs and creates new ones."
            />
            <div className="mt-5 grid grid-cols-3 gap-2">
              <ValueMetric field="totalInput" label="total input" value={detail.isCoinbase ? "new issuance" : formatBtc(detail.inputValue)} />
              <ValueMetric field="totalOutput" label="total output" value={formatBtc(detail.outputValue)} />
              <ValueMetric field="fee" label="miner fee" value={formatBtc(detail.fee)} />
            </div>
            <div className="mt-4 rounded-xl border border-emerald-300/10 bg-emerald-300/[.035] p-3 font-mono text-[10px] leading-relaxed text-emerald-100/50">
              {detail.isCoinbase
                ? "Coinbase detected: its input creates the block subsidy and collects transaction fees, so there is no previous output to subtract."
                : feeEquationMatches
                  ? `${formatSats(detail.inputValue)} input − ${formatSats(detail.outputValue)} output = ${formatSats(detail.fee)} fee`
                  : "The node supplied the fee directly. Some input values may be unavailable while the transaction is being indexed."}
            </div>
          </section>

          <section className={cardClass}>
            <SectionHeading
              eyebrow="confirmation"
              title={detail.confirmed ? "Written into the chain" : "Still in the rain"}
              description={detail.confirmed
                ? "A miner included this transaction in a Bitcoin block."
                : "The transaction is valid but has not yet been included in a block."}
            />
            {detail.confirmed ? (
              <div className="mt-5 space-y-3">
                <DataRow field="blockHeight" label="block height" value={formatNumber(detail.blockHeight ?? 0)} />
                <DataRow field="blockTime" label="block time" value={formatDate(detail.blockTime)} />
                <DataRow field="blockHash" label="block hash" value={detail.blockHash || "unavailable"} copy={detail.blockHash} mono />
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-emerald-300/15 bg-emerald-300/5 p-4 text-sm leading-relaxed text-emerald-50/60">
                Fee rate strongly influences confirmation priority, but miners choose transactions and no exact confirmation time is guaranteed.
              </div>
            )}
          </section>
        </div>

        <section className={`${cardClass} mt-5`}>
          <SectionHeading
            eyebrow="transaction anatomy"
            title="Serialization and policy"
            description="These fields control how nodes interpret, relay, validate, and price the transaction."
          />
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryMetric field="version" label="version" value={String(detail.version)} />
            <SummaryMetric field="locktime" label="locktime" value={formatLocktime(detail.locktime)} />
            <SummaryMetric field="size" label="total size" value={`${formatNumber(detail.size)} bytes`} />
            <SummaryMetric field="baseSize" label="base size" value={`${formatNumber(detail.baseSize)} bytes`} />
            <SummaryMetric field="witnessSize" label="witness size" value={`${formatNumber(detail.witnessSize)} bytes`} />
            <SummaryMetric field="sigops" label="signature ops" value={detail.sigops === undefined ? "not reported" : formatNumber(detail.sigops)} />
          </div>
          {(detail.adjustedVsize !== undefined || detail.effectiveFeeRate !== undefined) && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {detail.adjustedVsize !== undefined && (
                <SummaryMetric field="adjustedVsize" label="adjusted virtual size" value={`${detail.adjustedVsize.toFixed(2)} vB`} />
              )}
              {detail.effectiveFeeRate !== undefined && (
                <SummaryMetric field="effectiveFeeRate" label="effective fee rate" value={`${detail.effectiveFeeRate.toFixed(1)} sat/vB`} />
              )}
            </div>
          )}
        </section>

        <IoSection
          id="inputs"
          eyebrow="value sources"
          title={`${detail.inputs} input${detail.inputs === 1 ? "" : "s"}`}
          description="Each input consumes an earlier UTXO and proves that the spender is authorized."
        >
          {detail.vin.map((input) => <InputCard key={input.index} input={input} />)}
        </IoSection>

        <IoSection
          id="outputs"
          eyebrow="new coins"
          title={`${detail.outputs} output${detail.outputs === 1 ? "" : "s"}`}
          description="Outputs create the next set of UTXOs. Their locking scripts define who can spend them."
        >
          {detail.vout.map((output) => <OutputCard key={output.index} output={output} />)}
        </IoSection>

        <section className={`${cardClass} mt-5`}>
          <SectionHeading
            eyebrow="advanced"
            title="Raw transaction"
            description="The exact bytes propagated across the Bitcoin peer-to-peer network."
          />
          <div className="mt-5"><FieldLabel field="rawHex">serialized hexadecimal</FieldLabel></div>
          <details className="mt-2 rounded-xl border border-emerald-300/10 bg-black/35">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 font-mono text-[10px] uppercase tracking-[.14em] text-emerald-100/60 [&::-webkit-details-marker]:hidden">
              <span>show raw bytes</span>
              <span>{detail.rawHex ? `${formatNumber(detail.rawHex.length / 2)} bytes` : "unavailable"} ＋</span>
            </summary>
            <div className="border-t border-emerald-300/10 p-4">
              {detail.rawHex ? (
                <>
                  <div className="flex justify-end"><CopyValueButton value={detail.rawHex} label="copy raw hex" /></div>
                  <code className="mt-3 block break-all font-mono text-[10px] leading-relaxed text-emerald-100/55">
                    {detail.rawHex}
                  </code>
                </>
              ) : (
                <p className="text-sm text-emerald-50/40">The node did not return raw transaction bytes.</p>
              )}
            </div>
          </details>
        </section>

        <footer className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-emerald-300/10 pt-6 sm:flex-row">
          <p className="font-mono text-[9px] uppercase tracking-[.16em] text-emerald-100/30">
            verify, don&apos;t trust · data from our bitcoin node
          </p>
          <div className="flex gap-2">
            <Link href={`/explorer/tx/${detail.txid}`} target="_blank" rel="noreferrer" className={navClass}>
              node explorer ↗
            </Link>
            <Link href="/" className={primaryNavClass}>back to matrix</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

function InputCard({ input }: { input: TransactionInput }) {
  const value = input.prevout?.value ?? 0;
  return (
    <article className="rounded-2xl border border-emerald-300/12 bg-black/40 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[.16em] text-emerald-300/45">input #{input.index}</div>
          <div className="mt-2"><FieldLabel field={input.isCoinbase ? "coinbase" : "totalInput"}>{input.isCoinbase ? "created value" : "previous output value"}</FieldLabel></div>
          <div className="mt-1 font-mono text-lg font-semibold text-emerald-50">
            {input.isCoinbase ? "block subsidy" : formatBtc(value)}
          </div>
        </div>
        <Badge tone={input.sequenceType === "rbf" ? "amber" : "emerald"}>
          {input.isCoinbase ? "coinbase" : input.sequenceType}
        </Badge>
      </div>

      {input.isCoinbase ? (
        <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-sm leading-relaxed text-amber-50/65">
          <div className="mb-1"><FieldLabel field="coinbase">coinbase input</FieldLabel></div>
          This special input does not spend a previous transaction.
        </div>
      ) : (
        <>
          <div className="mt-4">
            <FieldLabel field="prevout">previous output</FieldLabel>
            <div className="mt-2 flex items-start gap-2">
              <Link href={`/tx/${input.txid}`} className="min-w-0 flex-1 break-all font-mono text-[10px] leading-relaxed text-emerald-200/70 underline decoration-emerald-300/20 underline-offset-4">
                {input.txid}:{input.vout}
              </Link>
              {input.txid && <CopyValueButton value={input.txid} />}
            </div>
          </div>
          <AddressBlock script={input.prevout?.script} />
        </>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CompactField field="sequence" label="sequence" value={`${formatNumber(input.sequence)} · 0x${input.sequence.toString(16).padStart(8, "0")}`} />
        <CompactField field="scriptType" label="previous script type" value={scriptTypeLabel(input.prevout?.script.type)} />
      </div>

      <details className="mt-4 rounded-xl border border-emerald-300/10 bg-black/30">
        <summary className={detailsSummaryClass}>unlocking data <span>＋</span></summary>
        <div className="space-y-4 border-t border-emerald-300/10 p-4">
          <CodeField field="scriptSig" label="scriptSig assembly" value={input.scriptSig.asm} />
          <CodeField field="scriptSig" label="scriptSig hex" value={input.scriptSig.hex} />
          <div>
            <FieldLabel field="witness">witness stack</FieldLabel>
            {input.witness.length > 0 ? (
              <div className="mt-2 space-y-2">
                {input.witness.map((item, index) => (
                  <div key={`${index}-${item.slice(0, 12)}`} className="rounded-lg border border-emerald-300/8 bg-black/35 p-2">
                    <div className="font-mono text-[8px] uppercase tracking-[.12em] text-emerald-100/25">item {index}</div>
                    <code className="mt-1 block break-all font-mono text-[9px] leading-relaxed text-emerald-100/50">{item || "empty"}</code>
                  </div>
                ))}
              </div>
            ) : <EmptyValue />}
          </div>
          {input.innerRedeemScriptAsm && <CodeField field="scriptSig" label="inner redeem script" value={input.innerRedeemScriptAsm} />}
          {input.innerWitnessScriptAsm && <CodeField field="witness" label="inner witness script" value={input.innerWitnessScriptAsm} />}
          {input.prevout && (
            <>
              <CodeField field="scriptPubKey" label="previous locking script assembly" value={input.prevout.script.asm} />
              <CodeField field="scriptPubKey" label="previous locking script hex" value={input.prevout.script.hex} />
            </>
          )}
        </div>
      </details>
    </article>
  );
}

function OutputCard({ output }: { output: TransactionOutput }) {
  return (
    <article className="rounded-2xl border border-emerald-300/12 bg-black/40 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[.16em] text-emerald-300/45">output #{output.index}</div>
          <div className="mt-2"><FieldLabel field="outputValue">output value</FieldLabel></div>
          <div className="mt-1 font-mono text-lg font-semibold text-emerald-50">{formatBtc(output.value)}</div>
          <div className="mt-1 font-mono text-[9px] text-emerald-100/35">{formatSats(output.value)}</div>
        </div>
        <Badge tone={output.spend.spent ? "sky" : "emerald"}>
          {!output.spend.known ? "status unavailable" : output.spend.spent ? "spent" : "unspent"}
        </Badge>
      </div>

      <AddressBlock script={output.script} />

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CompactField field="scriptType" label="script type" value={scriptTypeLabel(output.script.type)} />
        <CompactField
          field="spent"
          label="UTXO status"
          value={!output.spend.known
            ? "outspend lookup unavailable"
            : output.spend.spent
              ? "spent by another input"
              : "available to spend"}
        />
      </div>

      {output.spend.spent && output.spend.txid && (
        <div className="mt-4 rounded-xl border border-sky-300/12 bg-sky-300/5 p-3">
          <FieldLabel field="spent">spending transaction</FieldLabel>
          <Link href={`/tx/${output.spend.txid}`} className="mt-2 block break-all font-mono text-[10px] leading-relaxed text-sky-100/70 underline decoration-sky-300/20 underline-offset-4">
            {output.spend.txid}:{output.spend.vin ?? "?"}
          </Link>
          <div className="mt-2 font-mono text-[8px] uppercase tracking-[.12em] text-sky-100/35">
            {output.spend.confirmed ? `confirmed in block ${formatNumber(output.spend.blockHeight ?? 0)}` : "currently in mempool"}
          </div>
        </div>
      )}

      <details className="mt-4 rounded-xl border border-emerald-300/10 bg-black/30">
        <summary className={detailsSummaryClass}>locking script <span>＋</span></summary>
        <div className="space-y-4 border-t border-emerald-300/10 p-4">
          <CodeField field="scriptPubKey" label="scriptPubKey assembly" value={output.script.asm} />
          <CodeField field="scriptPubKey" label="scriptPubKey hex" value={output.script.hex} />
        </div>
      </details>
    </article>
  );
}

function AddressBlock({ script }: { script?: TransactionScript }) {
  return (
    <div className="mt-4">
      <FieldLabel field="address">address or script destination</FieldLabel>
      <div className="mt-2 flex items-start gap-2 rounded-xl border border-emerald-300/8 bg-black/30 p-3">
        <code className="min-w-0 flex-1 break-all font-mono text-[10px] leading-relaxed text-emerald-100/60">
          {script?.address || (script?.type === "op_return" ? "OP_RETURN · provably unspendable data" : "No address encoding available")}
        </code>
        {script?.address && <CopyValueButton value={script.address} />}
      </div>
    </div>
  );
}

function IoSection({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeading eyebrow={eyebrow} title={title} description={description} />
        <div className="font-mono text-[8px] uppercase tracking-[.15em] text-emerald-100/25">expand rows for scripts</div>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{children}</div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[.2em] text-emerald-300/45">{eyebrow}</div>
      <h2 className="mt-1 text-xl font-semibold tracking-[-.035em] text-emerald-50 sm:text-2xl">{title}</h2>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-emerald-50/40">{description}</p>
    </div>
  );
}

function SummaryMetric({
  field,
  label,
  value,
}: {
  field: TransactionEducationKey;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-emerald-300/10 bg-black/30 p-3">
      <FieldLabel field={field}>{label}</FieldLabel>
      <div className="mt-2 truncate font-mono text-sm font-semibold text-emerald-50" title={value}>{value}</div>
    </div>
  );
}

function ValueMetric({
  field,
  label,
  value,
}: {
  field: TransactionEducationKey;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-emerald-300/8 bg-black/30 p-3">
      <FieldLabel field={field}>{label}</FieldLabel>
      <div className="mt-2 break-words font-mono text-xs font-semibold text-emerald-50 sm:text-sm">{value}</div>
    </div>
  );
}

function CompactField({
  field,
  label,
  value,
}: {
  field: TransactionEducationKey;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-emerald-300/8 bg-black/25 p-3">
      <FieldLabel field={field}>{label}</FieldLabel>
      <div className="mt-2 break-all font-mono text-[10px] leading-relaxed text-emerald-50/70">{value}</div>
    </div>
  );
}

function DataRow({
  field,
  label,
  value,
  copy,
  mono = false,
}: {
  field: TransactionEducationKey;
  label: string;
  value: string;
  copy?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-emerald-300/8 bg-black/25 p-3">
      <FieldLabel field={field}>{label}</FieldLabel>
      <div className="flex min-w-0 items-start gap-2">
        <span className={`${mono ? "break-all font-mono text-[10px]" : "text-sm"} text-right text-emerald-50/70`}>{value}</span>
        {copy && <CopyValueButton value={copy} />}
      </div>
    </div>
  );
}

function CodeField({
  field,
  label,
  value,
}: {
  field: TransactionEducationKey;
  label: string;
  value: string;
}) {
  return (
    <div>
      <FieldLabel field={field}>{label}</FieldLabel>
      {value ? (
        <code className="mt-2 block break-all rounded-lg border border-emerald-300/8 bg-black/35 p-3 font-mono text-[9px] leading-relaxed text-emerald-100/50">
          {value}
        </code>
      ) : <EmptyValue />}
    </div>
  );
}

function EmptyValue() {
  return <div className="mt-2 font-mono text-[9px] uppercase tracking-[.12em] text-emerald-100/20">empty · not used by this input</div>;
}

function StatusBadge({ confirmed }: { confirmed: boolean }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 font-mono text-[8px] uppercase tracking-[.14em] ${confirmed ? "border-sky-300/25 bg-sky-300/10 text-sky-100" : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"}`}>
      {confirmed ? "confirmed" : "unconfirmed"}
    </span>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "emerald" | "amber" | "sky";
}) {
  const classes = {
    emerald: "border-emerald-300/20 bg-emerald-300/8 text-emerald-100/70",
    amber: "border-amber-300/20 bg-amber-300/8 text-amber-100/70",
    sky: "border-sky-300/20 bg-sky-300/8 text-sky-100/70",
  };
  return <span className={`rounded-full border px-2.5 py-1 font-mono text-[8px] uppercase tracking-[.12em] ${classes[tone]}`}>{children}</span>;
}

function scriptTypeLabel(type?: string): string {
  return ({
    p2pk: "P2PK · public key",
    p2pkh: "P2PKH · legacy address",
    p2sh: "P2SH · script hash",
    v0_p2wpkh: "P2WPKH · native SegWit",
    v0_p2wsh: "P2WSH · SegWit script",
    v1_p2tr: "P2TR · Taproot",
    op_return: "OP_RETURN · data output",
  } as Record<string, string>)[type ?? ""] ?? (type || "unknown");
}

function formatLocktime(locktime: number): string {
  if (locktime === 0) return "disabled";
  if (locktime < 500_000_000) return `block ${formatNumber(locktime)}`;
  return formatDate(locktime);
}

function formatDate(timestamp?: number): string {
  if (!timestamp) return "unavailable";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(timestamp * 1000));
}

function formatBtc(sats: number): string {
  return `${(sats / 100_000_000).toFixed(8)} BTC`;
}

function formatSats(sats: number): string {
  return `${formatNumber(Math.round(sats))} sats`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

const cardClass = "rounded-2xl border border-emerald-300/15 bg-black/55 p-4 shadow-[0_0_60px_rgba(25,255,110,.035)] backdrop-blur-xl sm:p-5";
const navClass = "flex min-h-11 items-center rounded-full border border-emerald-300/15 bg-black/35 px-4 font-mono text-[9px] uppercase tracking-[.16em] text-emerald-100/60 transition hover:border-emerald-300/40";
const primaryNavClass = "flex min-h-11 items-center rounded-full border border-emerald-200/35 bg-emerald-300/10 px-4 font-mono text-[9px] uppercase tracking-[.16em] text-emerald-50 transition hover:bg-emerald-300/15";
const detailsSummaryClass = "flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 font-mono text-[9px] uppercase tracking-[.14em] text-emerald-100/45 [&::-webkit-details-marker]:hidden";
