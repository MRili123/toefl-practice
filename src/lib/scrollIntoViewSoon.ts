/**
 * Brings element `id` into view once the page has settled. A single scroll right after loading can be undone by
 * the router's own scroll handling or by content still loading above it, so this re-checks a few times and stops
 * once the element has stayed in view (or after ~3 s, so it never fights the user's own scrolling for long).
 */
export function scrollIntoViewSoon(id: string, block: ScrollLogicalPosition = "start") {
  let tries = 0;
  let steady = 0;
  const check = () => {
    const el = document.getElementById(id);
    const r = el?.getBoundingClientRect();
    const visible = !!r && r.top >= 0 && r.top < window.innerHeight * 0.6;
    if (el && !visible) {
      el.scrollIntoView({ block });
      steady = 0;
    } else if (el) steady++;
    if (steady < 2 && ++tries < 12) setTimeout(check, 250);
  };
  setTimeout(check, 50);
}
