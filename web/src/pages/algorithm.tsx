import type { ReactNode } from "react"
import {
  ArrowRight,
  BookOpen,
  Boxes,
  Eye,
  Gauge,
  MessageSquareWarning,
  Package,
  ScrollText,
  ShieldCheck,
  ThumbsUp,
  TriangleAlert,
} from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { BaitDial } from "@/components/bait-dial"
import { ScoreMeter } from "@/components/score-meter"
import { CodeBlock } from "@/components/shared/code-block"
import { formatCompact } from "@/lib/format"
import { cn } from "@/lib/utils"
import { EXAMPLE, FORMULAS, PAPERS, STRENGTHS, WEAKNESSES } from "@/constants/algorithm"

const e = EXAMPLE
const pct = (n: number) => Math.round(n * 100)

export function Algorithm() {
  return (
    <div className="space-y-10">
      <Hero />
      <ExampleHeader />
      <SignalsExtracted />
      <PackagingPillar />
      <MismatchPillar />
      <BetrayalPillar />
      <FinalBlend />
      <ChannelRollup />
      <Research />
      <StrengthsWeaknesses />
      <Footnote />
    </div>
  )
}

// ── Hero + pipeline strip ───────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <Badge className="bg-bait-yellow font-heading uppercase tracking-wide">The algorithm</Badge>
        <h1 className="font-heading text-3xl leading-tight sm:text-4xl">How BaitRadar scores clickbait</h1>
        <p className="max-w-3xl text-foreground/75">
          Clickbait isn't just a loud thumbnail — it's the <strong>gap between the promise</strong>{" "}
          (title + thumbnail) and the <strong>payoff</strong> (what the video actually delivers, and how
          the audience reacts). BaitRadar measures that gap with three weighted pillars. Below is a real,
          end-to-end run of one video through the exact production pipeline — every formula, constant and
          number is genuine.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PipeStep icon={Boxes} label="Extract signals" />
        <PipeArrow />
        <PipeStep icon={Package} label="Packaging" tone="bg-bait-blue" />
        <PipeStep icon={ScrollText} label="Mismatch" tone="bg-bait-purple" />
        <PipeStep icon={MessageSquareWarning} label="Betrayal" tone="bg-bait-pink" />
        <PipeArrow />
        <PipeStep icon={Gauge} label="Blend → %" tone="bg-bait-green" />
      </div>
    </section>
  )
}

function PipeStep({ icon: Icon, label, tone }: { icon: typeof Boxes; label: string; tone?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-base border-2 border-border px-3 py-1.5 font-heading text-sm shadow-shadow",
        tone ?? "bg-secondary-background",
      )}
    >
      <Icon className="size-4" /> {label}
    </span>
  )
}

function PipeArrow() {
  return <ArrowRight className="size-5 shrink-0 text-foreground/50" />
}

// ── The worked example header (embedded video) ──────────────────────────────────
function ExampleHeader() {
  return (
    <Card>
      <CardContent className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="self-start overflow-hidden rounded-base border-2 border-border shadow-shadow">
          <div className="aspect-video w-full">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${e.videoId}`}
              title={e.title}
              className="size-full"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
        <div className="flex flex-col justify-between gap-5">
          <div className="space-y-2">
            <Badge variant="neutral" className="font-base uppercase tracking-wide">Worked example</Badge>
            <h2 className="font-heading text-2xl leading-tight">{e.title}</h2>
            <p className="text-sm font-heading text-foreground/60">{e.channelTitle} · {e.duration}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-sm">
              <Stat icon={Eye} value={formatCompact(e.views)} label="views" />
              <Stat icon={ThumbsUp} value={formatCompact(e.likes)} label="likes" />
              <Stat icon={MessageSquareWarning} value={formatCompact(e.commentCount)} label="comments" />
            </div>
          </div>
          <div className="flex items-center gap-5 rounded-base border-2 border-border bg-secondary-background p-4">
            <BaitDial value={e.percentage} size={110} />
            <div className="space-y-1">
              <p className="font-heading text-lg">{e.likelihood}</p>
              <p className="text-sm text-foreground/70">
                Heavy packaging (0.55) — but it <strong>delivers</strong> (mismatch 0) and no viewer
                cried bait (0/200), so the blended score lands low.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Stat({ icon: Icon, value, label }: { icon: typeof Eye; value: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-4 text-foreground/60" />
      <span className="font-heading tabular-nums">{value}</span>
      <span className="text-xs uppercase tracking-wide text-foreground/50">{label}</span>
    </span>
  )
}

// ── Signals extracted ───────────────────────────────────────────────────────────
function SignalsExtracted() {
  const el = e.elements
  return (
    <Section icon={Boxes} title="1 · Signals we extract" tone="bg-bait-yellow">
      <p className="text-foreground/75">
        Before any scoring, the worker pulls five raw inputs. Shorts (&lt; 60s) are skipped entirely — they
        lack the promise/payoff structure the model reasons about.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <SignalGroup label="Title" tone="bg-bait-blue" items={[el.title]} />
        <SignalGroup label="Description (excerpt)" tone="bg-bait-blue" items={[el.descriptionPreview]} />
        <SignalGroup label="Thumbnail — OCR overlay text" tone="bg-bait-yellow" items={el.thumbnailOcr} />
        <SignalGroup label="Thumbnail — vision objects" tone="bg-bait-green" items={el.thumbnailObjects} />
        <SignalGroup label="Thumbnail — vision tags" tone="bg-bait-green" items={el.thumbnailTags} />
        <div className="grid grid-cols-2 gap-4">
          <CountTile value={el.transcriptSegments.toLocaleString()} label="transcript segments" />
          <CountTile value={el.commentsAnalyzed.toLocaleString()} label="comments analyzed" />
        </div>
      </div>
    </Section>
  )
}

function SignalGroup({ label, items, tone }: { label: string; items: readonly string[]; tone: string }) {
  return (
    <div className="rounded-base border-2 border-border bg-secondary-background p-3">
      <p className="mb-2 text-xs font-heading uppercase tracking-wide text-foreground/55">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <Badge key={it} className={cn("font-base", tone)}>{it}</Badge>
        ))}
      </div>
    </div>
  )
}

function CountTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col justify-center rounded-base border-2 border-border bg-secondary-background p-3 text-center">
      <span className="font-heading text-2xl tabular-nums">{value}</span>
      <span className="text-xs uppercase tracking-wide text-foreground/55">{label}</span>
    </div>
  )
}

// ── Pillar 1 ────────────────────────────────────────────────────────────────────
function PackagingPillar() {
  const p = e.packaging
  const worked = `overlaySignal  = 0.25      # "DAY 29" printed on the thumbnail
capsSignal     = 0.08      # 1 of 6 words ALL-CAPS  ("DAY")
absoluteSignal = 0.10      # 1 sensational word hit
punctSignal    = 0.00      # no "!" or "?" in the title
                 ────
heuristic      = 0.43

packaging = 0.3 × 0.43  +  0.7 × 0.60   = 0.55
                              ▲ Gemini (multimodal, ${p.llmSource})`
  return (
    <PillarSection
      index="2"
      icon={Package}
      tone="bg-bait-blue"
      title="Pillar 1 — Packaging"
      weight={e.weights.packaging}
      lead="How sensational the title, description and thumbnail are. A deterministic heuristic and a multimodal Gemini call score the same evidence; the two are merged 30/70."
      paperIdx={0}
      score={p.score}
    >
      <CodeBlock title="formula">{FORMULAS.packagingHeuristic}</CodeBlock>
      <CodeBlock title="merge">{FORMULAS.packagingMerge}</CodeBlock>
      <CodeBlock title="this video">{worked}</CodeBlock>
    </PillarSection>
  )
}

// ── Pillar 2 ────────────────────────────────────────────────────────────────────
function MismatchPillar() {
  const m = e.mismatch
  const worked = `transcript available?  yes  (${e.elements.transcriptSegments.toLocaleString()} segments)
Gemini judge verdict   →  0.00   # the video fully delivers the "30 days chained" premise
source                 →  "gemini"

# If there were no transcript, this pillar would be "unavailable" and its 0.4
# weight would be split across packaging + betrayal.`
  return (
    <PillarSection
      index="3"
      icon={ScrollText}
      tone="bg-bait-purple"
      title="Pillar 2 — Promise–payoff mismatch"
      weight={e.weights.mismatch}
      lead="The gap between what the title/thumbnail promise and what the transcript actually delivers — judged by a Gemini model fed a condensed view of the whole video. This is the defining clickbait signal."
      paperIdx={3}
      score={m.score}
    >
      <CodeBlock title="formula">{FORMULAS.mismatch}</CodeBlock>
      <CodeBlock title="this video">{worked}</CodeBlock>
    </PillarSection>
  )
}

// ── Pillar 3 ────────────────────────────────────────────────────────────────────
function BetrayalPillar() {
  const b = e.betrayal
  const worked = `flaggedComments = ${b.flagged}     # 0 of ${b.total} newest comments matched a betrayal phrase
                      #   or a negative opinion about the thumbnail/title/intro
rate  = ${b.flagged} / ${b.total} = ${b.rate.toFixed(2)}
score = clamp01(${b.rate.toFixed(2)} / 0.20) = ${b.score.toFixed(2)}

# Note: 0 means "no betrayal signal", not "certified honest" — a fan-heavy
# comment section rarely calls out bait (see weaknesses).`
  return (
    <PillarSection
      index="4"
      icon={MessageSquareWarning}
      tone="bg-bait-pink"
      title="Pillar 3 — Audience betrayal"
      weight={e.weights.betrayal}
      lead="How many commenters call the video out as clickbait or say it didn't deliver — from a betrayal-phrase lexicon plus Azure aspect-based opinion mining."
      paperIdx={4}
      score={b.score}
    >
      <CodeBlock title="formula">{FORMULAS.betrayal}</CodeBlock>
      <CodeBlock title="this video">{worked}</CodeBlock>
    </PillarSection>
  )
}

// ── Final blend ─────────────────────────────────────────────────────────────────
function FinalBlend() {
  const worked = `packaging  0.55 × 0.40 = 0.220
mismatch   0.00 × 0.40 = 0.000
betrayal   0.00 × 0.20 = 0.000
                         ─────
raw                     = 0.220
percentage = round(0.220 × 100) = 22%   →  "Less Likely"  (20–40 band)`
  return (
    <Section icon={Gauge} title="5 · Blending the pillars" tone="bg-bait-green">
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="space-y-4">
          <CodeBlock title="formula">{FORMULAS.blend}</CodeBlock>
          <CodeBlock title="this video">{worked}</CodeBlock>
        </div>
        <div className="flex flex-col items-center gap-2 rounded-base border-2 border-border bg-secondary-background p-6">
          <BaitDial value={e.percentage} size={150} />
          <Badge className="bg-bait-green font-heading uppercase">{e.likelihood}</Badge>
        </div>
      </div>
    </Section>
  )
}

// ── Channel rollup ──────────────────────────────────────────────────────────────
function ChannelRollup() {
  return (
    <Section icon={Boxes} title="6 · From video to channel" tone="bg-bait-orange">
      <p className="text-foreground/75">
        Each analyzed video feeds a per-channel <strong>clickbait propensity</strong> — a recency-weighted
        mean (newer uploads weigh more, since channels drift), plus the share of flagged videos and a trend.
      </p>
      <CodeBlock title="formula">{FORMULAS.channel}</CodeBlock>
    </Section>
  )
}

// ── Research ────────────────────────────────────────────────────────────────────
function Research() {
  return (
    <Section icon={BookOpen} title="Research this is built on" tone="bg-bait-purple">
      <ul className="space-y-3">
        {PAPERS.map((paper) => (
          <li key={paper.href} className="rounded-base border-2 border-border bg-secondary-background p-3">
            <a
              href={paper.href}
              target="_blank"
              rel="noreferrer"
              className="font-heading underline decoration-2 underline-offset-2 hover:text-foreground/70"
            >
              {paper.title}
            </a>
            <p className="mt-1 text-sm text-foreground/70">{paper.note}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}

// ── Strengths & weaknesses ──────────────────────────────────────────────────────
function StrengthsWeaknesses() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-4">
          <h2 className="flex items-center gap-2 font-heading text-xl">
            <ShieldCheck className="size-5 text-bait-green" /> What's strong
          </h2>
          {STRENGTHS.map((s) => (
            <Point key={s.label} label={s.label} detail={s.detail} tone="border-l-bait-green" />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-4">
          <h2 className="flex items-center gap-2 font-heading text-xl">
            <TriangleAlert className="size-5 text-bait-red" /> What's weak / not efficient yet
          </h2>
          {WEAKNESSES.map((w) => (
            <Point key={w.label} label={w.label} detail={w.detail} tone="border-l-bait-red" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function Point({ label, detail, tone }: { label: string; detail: string; tone: string }) {
  return (
    <div className={cn("border-l-4 pl-3", tone)}>
      <p className="font-heading text-sm">{label}</p>
      <p className="text-sm text-foreground/70">{detail}</p>
    </div>
  )
}

function Footnote() {
  return (
    <p className="rounded-base border-2 border-dashed border-border p-4 text-center text-sm text-foreground/60">
      This walkthrough is a genuine local run of the video above through the production pipeline. The sample
      was removed from the tracked dataset afterwards, so it won't appear on the dashboard.
    </p>
  )
}

// ── Shared section shells ────────────────────────────────────────────────────────
function Section({
  icon: Icon,
  title,
  tone,
  children,
}: {
  icon: typeof Boxes
  title: string
  tone: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardContent className="space-y-4">
        <h2 className="flex items-center gap-2 font-heading text-xl">
          <span className={cn("grid size-8 place-items-center rounded-base border-2 border-border", tone)}>
            <Icon className="size-4 text-main-foreground" />
          </span>
          {title}
        </h2>
        {children}
      </CardContent>
    </Card>
  )
}

function PillarSection({
  index,
  icon,
  tone,
  title,
  weight,
  lead,
  score,
  paperIdx,
  children,
}: {
  index: string
  icon: typeof Boxes
  tone: string
  title: string
  weight: number
  lead: string
  score: number
  paperIdx: number
  children: ReactNode
}) {
  const paper = PAPERS[paperIdx]
  return (
    <Section icon={icon} title={`${index} · ${title}`} tone={tone}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neutral" className="font-heading uppercase tracking-wide">
          weight {weight.toFixed(2)}
        </Badge>
        <Badge className={cn("font-heading uppercase tracking-wide", tone)}>
          this video: {pct(score)}%
        </Badge>
      </div>
      <p className="text-foreground/75">{lead}</p>
      <div className="max-w-xl">
        <ScoreMeter value={pct(score)} />
      </div>
      <div className="space-y-3">{children}</div>
      {paper && (
        <>
          <Separator />
          <p className="text-xs text-foreground/60">
            <BookOpen className="mr-1 inline size-3.5" />
            Grounded in{" "}
            <a href={paper.href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {paper.title}
            </a>
            .
          </p>
        </>
      )}
    </Section>
  )
}
