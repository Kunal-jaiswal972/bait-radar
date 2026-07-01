import { type ReactNode } from "react"
import { Link, Outlet } from "react-router-dom"
import { Radar } from "lucide-react"

import { Navbar } from "@/components/navbar"
import { ErrorBoundary } from "@/components/shared/error-boundary"

export function Layout() {
  // Flex column + flex-1 main keeps the footer pinned to the bottom even when a
  // page is short (otherwise it floats up under the content).
  return (
    <div className="flex min-h-svh flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-12">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <SiteFooter />
    </div>
  )
}

function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t-2 border-border bg-foreground text-background">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-base border-2 border-background bg-main text-main-foreground">
              <Radar className="size-5" />
            </span>
            <span className="font-heading text-xl">BaitRadar</span>
          </div>
          <p className="max-w-xs text-sm text-background/70">
            Clickbait scoring for YouTube — built from public packaging, content, and audience reaction.
          </p>
        </div>

        <FooterCol title="Product">
          <FooterLink to="/">Home</FooterLink>
          <FooterLink to="/channels">Channels</FooterLink>
          <FooterLink to="/videos">Videos</FooterLink>
        </FooterCol>

        <FooterCol title="Research">
          <FooterExtLink href="https://arxiv.org/html/2509.04714v1">ThumbnailTruth</FooterExtLink>
          <FooterExtLink href="https://arxiv.org/html/2505.17448v1">BaitRadar paper</FooterExtLink>
        </FooterCol>

        <FooterCol title="Good to know">
          <p className="text-sm text-background/70">
            Scores estimate clickbait from public signals only. They exclude watch-time, which just the creator can
            authorize.
          </p>
        </FooterCol>
      </div>

      <div className="border-t-2 border-background/20">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs font-heading uppercase tracking-widest text-background/60 sm:flex-row">
          <span>© {year} BaitRadar</span>
          <span>Built with React · neobrutalism.dev</span>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-heading text-sm uppercase tracking-widest text-background/90">{title}</h3>
      <div className="flex flex-col gap-2 text-sm text-background/70">{children}</div>
    </div>
  )
}

function FooterLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="w-fit transition-colors hover:text-background hover:underline underline-offset-4">
      {children}
    </Link>
  )
}

function FooterExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="w-fit transition-colors hover:text-background hover:underline underline-offset-4"
    >
      {children}
    </a>
  )
}
