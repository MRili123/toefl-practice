"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { IconArrowLeft } from "@/components/ui/icons";

const onClient = () => true;
const noop = () => () => {};

/**
 * Shown when a page was opened from My Mistakes: returns to that mistake in the list. It floats at the bottom of
 * the screen (the page scrolls down to the mistake, so a button at the top would be out of view), rendered on
 * <body> because the page's animated wrapper would otherwise pin "fixed" elements to itself.
 */
export function BackToMistakes({ mistakeId }: { mistakeId: string }) {
  const mounted = useSyncExternalStore(noop, onClient, () => false);
  if (!mounted) return null;
  return createPortal(
    <Link
      href={`/profile#mistake-${encodeURIComponent(mistakeId)}`}
      className="fixed bottom-6 left-1/2 z-40 inline-flex h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-medium text-white shadow-[0_10px_30px_rgba(22,24,29,0.25)] hover:bg-accent-hover"
    >
      <IconArrowLeft width={18} height={18} /> Back to My Mistakes
    </Link>,
    document.body,
  );
}
