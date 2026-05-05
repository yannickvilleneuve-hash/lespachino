import Image from "next/image";
import Link from "next/link";

export default function AppHeader({
  title,
  right,
  logoHref = "/inventaire",
}: {
  title: string;
  right?: React.ReactNode;
  logoHref?: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950 text-white">
      <div className="flex min-h-12 items-center gap-3 px-4 py-2">
        <Link href={logoHref} className="flex shrink-0 items-center gap-3">
          <Image
            src="/logo1.jpg"
            alt="Centre du camion Hino"
            width={78}
            height={32}
            priority
            className="rounded-sm"
          />
        </Link>
        <h1 className="min-w-0 truncate text-sm font-semibold uppercase tracking-wide">
          {title}
        </h1>
        {right && (
          <div className="ml-auto flex shrink-0 items-center gap-3 text-xs">
            {right}
          </div>
        )}
      </div>
    </header>
  );
}
