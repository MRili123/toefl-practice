/* eslint-disable @next/next/no-img-element -- small local avatars; next/image adds nothing here */
export function Avatar({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return src ? (
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover ring-1 ring-line" style={{ width: size, height: size }} />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-accent-weak text-xs font-semibold text-accent"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
