import Image from "next/image";
import Link from "next/link";
import pkg from "../package.json";

const VERSION = pkg.version;

export default function AppHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex items-center gap-3 px-4 py-2 bg-slate-900 text-white">
      <Link href="/" className="flex items-center gap-3">
        <Image
          src="/logo1.jpg"
          alt="Centre du camion Hino"
          width={78}
          height={32}
          priority
          className="rounded-sm"
        />
      </Link>
      <h1 className="text-sm font-semibold tracking-wide uppercase">
        {title}
        <span
          className="inline-block ml-2 px-2 py-0.5 rounded-full text-xs font-semibold border border-white/35 bg-white/15 text-sky-100"
          title={`Version ${VERSION}`}
        >
          v{VERSION}
        </span>
      </h1>
      {right && <div className="ml-auto flex items-center gap-3">{right}</div>}
    </header>
  );
}
