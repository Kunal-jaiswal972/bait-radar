import { NavLink } from "react-router-dom"

import { cn } from "@/lib/utils"

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/channels", label: "Channels" },
  { to: "/videos", label: "Videos" },
]

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b-2 border-border bg-background/95 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <NavLink to="/" className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-base border-2 border-border bg-main text-lg shadow-shadow">
            🎯
          </span>
          <span className="font-heading text-xl tracking-tight">BaitRadar</span>
        </NavLink>

        <div className="flex items-center gap-1 sm:gap-2">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                cn(
                  "rounded-base border-2 px-3 py-1.5 text-sm font-heading transition-all",
                  isActive
                    ? "border-border bg-main text-main-foreground shadow-shadow"
                    : "border-transparent hover:border-border hover:bg-secondary-background",
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </header>
  )
}
