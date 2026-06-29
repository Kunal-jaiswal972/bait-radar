import { Outlet } from "react-router-dom"

import { Navbar } from "@/components/navbar"

export function Layout() {
  return (
    <div className="min-h-svh">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <Outlet />
      </main>
      <footer className="border-t-2 border-border bg-foreground py-6 text-center text-sm font-heading uppercase tracking-widest text-background">
        BaitRadar · Vite + React + neobrutalism.dev
      </footer>
    </div>
  )
}
