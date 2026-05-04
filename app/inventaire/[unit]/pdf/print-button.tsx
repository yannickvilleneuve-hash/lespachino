"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white print:hidden"
    >
      Imprimer / PDF
    </button>
  );
}
