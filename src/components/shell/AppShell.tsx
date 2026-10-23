"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { cx } from "@/components/ui/primitives";
import { IconCourse, IconGrid, IconLayers, IconUser } from "@/components/ui/icons";

const NAV: { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; also?: string[] }[] = [
  { href: "/series", label: "Series", icon: IconLayers },
  { href: "/courses", label: "Courses", icon: IconCourse },
  { href: "/exercises", label: "Exercises", icon: IconGrid },
  // Results are reached from Profile → Test History.
  { href: "/profile", label: "Profile", icon: IconUser, also: ["/results"] },
];

function isActive(pathname: string, item: (typeof NAV)[number]) {
  return [item.href, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const viewKey = pathname.split("/")[1] ?? "";
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-8 px-4 sm:px-8">
          <Link href="/series" className="flex items-center gap-2.5" aria-label="TOEFL Practice home">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-white">T</span>
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold tracking-tight">TOEFL Practice</span>
              <span className="block text-[11px] text-ink-3">iBT 2026 format</span>
            </span>
          </Link>
          <nav aria-label="Main" className="hidden h-full items-stretch gap-1 md:flex">
            {NAV.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "relative flex items-center gap-2 px-3 text-[15px] transition-colors",
                    active ? "font-semibold text-accent" : "text-ink-2 hover:text-ink",
                  )}
                >
                  <span className={cx("flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors", active ? "bg-accent-weak" : "hover:bg-black/[0.03]")}>
                    <Icon width={17} height={17} />
                    {item.label}
                  </span>
                  <span className={cx("absolute inset-x-3 bottom-0 h-0.5 rounded-full transition-colors", active ? "bg-accent" : "bg-transparent")} />
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-8 sm:px-8 md:pb-16">
        <div key={viewKey} className="view-in">
          {children}
        </div>
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface/95 backdrop-blur md:hidden">
        {NAV.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx("flex flex-col items-center gap-0.5 py-2.5 text-[11px]", active ? "font-semibold text-accent" : "text-ink-3")}
            >
              <Icon width={20} height={20} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
