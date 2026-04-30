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
    <header className="flex items-center gap-3 px-4 py-2 bg-slate-900 text-white">
      <Link href={logoHref} className="flex items-center gap-3">
        <Image
          src="/logo1.jpg"
          alt="Centre du camion Hino"
          width={78}
          height={32}
          priority
          className="rounded-sm"
        />
      </Link>
      <h1 className="text-sm font-semibold tracking-wide uppercase">{title}</h1>
      {right && <div className="ml-auto flex items-center gap-3">{right}</div>}
    </header>
  );
}
