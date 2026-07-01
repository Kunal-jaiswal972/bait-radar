import { Link } from "react-router-dom"
import { MessageSquare, Scale, Search, Target, TrendingUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const features = [
  {
    Icon: Target,
    color: "bg-bait-yellow",
    title: "Bait score, 3 pillars",
    body: "Every upload gets a 0–100 score merged from how it's packaged, whether the content delivers, and how the audience reacts.",
  },
  {
    Icon: Scale,
    color: "bg-bait-blue",
    title: "Promise–payoff mismatch",
    body: "We read the transcript and ask a model the only question that matters: does the video actually deliver what the title and thumbnail promised?",
  },
  {
    Icon: MessageSquare,
    color: "bg-bait-pink",
    title: "Audience betrayal",
    body: "We mine the comments for people calling it out — “clickbait”, “nothing happened”, “where is the…” — to measure how betrayed viewers feel.",
  },
  {
    Icon: TrendingUp,
    color: "bg-bait-green",
    title: "Sentiment & trends",
    body: "Track comment sentiment and view/like velocity over a video's life — and watch a channel's bait propensity trend over time.",
  },
]

export function Home() {
  return (
    <div className="space-y-20">
      {/* Hero */}
      <section className="grid items-center gap-10 lg:grid-cols-2">
        <div className="space-y-6">
          <Badge className="bg-bait-purple font-heading uppercase">
            <Search className="size-3.5" /> YouTube Clickbait Analyzer
          </Badge>
          <h1 className="font-heading text-5xl leading-[1.04] sm:text-6xl">
            Catch the bait{" "}
            <span className="inline-block -rotate-1 rounded-base border-2 border-border bg-main px-2 shadow-shadow">
              before
            </span>{" "}
            you click.
          </h1>
          <p className="max-w-md text-lg text-foreground/80">
            BaitRadar tracks YouTube channels and scores every upload for clickbait — how it's packaged, whether the
            content delivers, and how betrayed the audience feels. No fluff, just receipts.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="font-heading uppercase">
              <Link to="/channels">+ Track a channel</Link>
            </Button>
            <Button asChild size="lg" variant="neutral" className="font-heading uppercase">
              <Link to="/videos">Browse analyzed videos</Link>
            </Button>
          </div>
          <p className="text-xs font-heading uppercase tracking-widest text-foreground/45">
            Public signals only · no creator login required
          </p>
        </div>

        {/* Hero visual — a sample score card */}
        <Card className="rotate-2 gap-4">
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-heading text-lg">Bait Score</span>
              <Badge className="bg-bait-red font-heading uppercase text-white">Most Likely</Badge>
            </div>
            <div className="font-heading text-7xl">
              88<span className="text-3xl text-foreground/40">/100</span>
            </div>
            <div className="space-y-2">
              <Row label="Packaging" v={91} />
              <Row label="Mismatch" v={78} />
              <Row label="Betrayal" v={62} />
            </div>
            <p className="border-t-2 border-dashed border-border pt-3 text-sm italic text-foreground/70">
              “I Tried the $1 Laptop and You WON'T BELIEVE What Happened”
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Features */}
      <section className="space-y-6">
        <div>
          <h2 className="font-heading text-3xl">How BaitRadar reads a video</h2>
          <p className="mt-1 max-w-2xl text-foreground/70">
            Four independent signals, combined into one honest score — and shown with the receipts behind it.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {features.map((f) => (
            <Card key={f.title}>
              <CardContent className="space-y-3">
                <div
                  className={`flex size-14 items-center justify-center rounded-base border-2 border-border shadow-shadow ${f.color}`}
                >
                  <f.Icon className="size-7" />
                </div>
                <h3 className="font-heading text-xl">{f.title}</h3>
                <p className="text-foreground/75">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="rounded-base border-2 border-border bg-main p-8 text-center shadow-shadow">
        <h2 className="font-heading text-3xl">Ready to expose the bait?</h2>
        <p className="mx-auto mt-2 max-w-lg text-main-foreground/80">
          Paste a channel URL and BaitRadar starts scoring its uploads automatically.
        </p>
        <Button asChild size="lg" variant="neutral" className="mt-5 font-heading uppercase">
          <Link to="/channels">Get started — it's free</Link>
        </Button>
      </section>
    </div>
  )
}

function Row({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-center gap-3 text-sm font-heading">
      <span className="w-20 uppercase tracking-wide">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-base border-2 border-border bg-secondary-background">
        <div className="h-full bg-foreground" style={{ width: `${v}%` }} />
      </div>
    </div>
  )
}
