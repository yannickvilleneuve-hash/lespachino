export function VehiclePlaceholder({ className = "" }: { className?: string }) {
  return (
    <div
      className={
        "flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 text-gray-400 " +
        className
      }
      aria-label="Photo à venir"
    >
      <svg
        viewBox="0 0 64 48"
        fill="currentColor"
        className="w-1/2 max-w-[80px] opacity-60"
        aria-hidden="true"
      >
        <path d="M2 12h32v22H2zM34 18h12l8 10v6H34zM10 38a4 4 0 1 1 8 0 4 4 0 0 1-8 0zM42 38a4 4 0 1 1 8 0 4 4 0 0 1-8 0z" />
      </svg>
      <span className="text-[10px] uppercase tracking-wide mt-1.5">Photo à venir</span>
    </div>
  );
}
