"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  deletePhoto,
  reorderPhotos,
  setHero,
  uploadPhoto,
  type UploadPhotoResult,
} from "@/lib/listings/actions";
import type { PhotoWithUrl } from "@/lib/listings/photos";

const UPLOAD_ERROR_MSG: Record<Exclude<UploadPhotoResult, { ok: true }>["error"], string> = {
  limit_reached: "Maximum 15 photos par véhicule.",
  invalid_type: "Format non supporté (JPEG/PNG/WebP seulement).",
  too_big: "Fichier trop gros (max 10 MB).",
  no_file: "Aucun fichier sélectionné.",
};

export default function PhotoManager({
  unit,
  initialPhotos,
}: {
  unit: string;
  initialPhotos: PhotoWithUrl[];
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [msg, setMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIdx = photos.findIndex((p) => p.id === e.active.id);
    const newIdx = photos.findIndex((p) => p.id === e.over!.id);
    const next = arrayMove(photos, oldIdx, newIdx);
    setPhotos(next);
    startTransition(async () => {
      try {
        await reorderPhotos(unit, next.map((p) => p.id));
      } catch (err) {
        setMsg((err as Error).message);
      }
    });
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setMsg(null);
    setUploadProgress({ done: 0, total: files.length });
    let i = 0;
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      const result = await uploadPhoto(unit, fd);
      i += 1;
      setUploadProgress({ done: i, total: files.length });
      if (!result.ok) {
        setMsg(UPLOAD_ERROR_MSG[result.error]);
        break;
      }
    }
    setUploadProgress(null);
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    await uploadFiles(files);
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragging(false);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    await uploadFiles(files);
  }

  function onDelete(id: string) {
    startTransition(async () => {
      try {
        await deletePhoto(id);
        setPhotos((curr) => curr.filter((p) => p.id !== id));
      } catch (err) {
        setMsg((err as Error).message);
      }
    });
  }

  function onSetHero(id: string) {
    startTransition(async () => {
      try {
        await setHero(unit, id);
        setPhotos((curr) => curr.map((p) => ({ ...p, is_hero: p.id === id })));
      } catch (err) {
        setMsg((err as Error).message);
      }
    });
  }

  return (
    <div
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={
        "relative " +
        (isDragging ? "ring-4 ring-blue-400 ring-offset-2 rounded" : "")
      }
    >
      <div className="flex items-center gap-3 mb-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={photos.length >= 15 || isPending || uploadProgress !== null}
          className="bg-blue-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
        >
          + Ajouter photos
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={onUpload}
          className="hidden"
        />
        <span className="text-sm text-gray-500">{photos.length} / 15</span>
        {uploadProgress && (
          <span className="text-sm text-blue-700">
            Upload {uploadProgress.done} / {uploadProgress.total}…
          </span>
        )}
        <span className="text-xs text-gray-400 ml-auto hidden sm:inline">
          ou glisser/déposer ici
        </span>
      </div>
      {isDragging && (
        <div className="absolute inset-0 bg-blue-50/80 border-2 border-dashed border-blue-400 rounded flex items-center justify-center pointer-events-none z-10">
          <p className="text-blue-700 font-semibold text-lg">📁 Lâcher les photos ici</p>
        </div>
      )}
      {msg && <p className="text-sm text-red-600 mb-2">{msg}</p>}

      {photos.length === 0 ? (
        <p className="text-sm text-gray-500 border-2 border-dashed border-gray-300 rounded p-8 text-center">
          Aucune photo. Glisse-dépose des images ou clique « + Ajouter photos ».
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={photos.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {photos.map((p) => (
                <SortablePhoto
                  key={p.id}
                  photo={p}
                  onDelete={() => onDelete(p.id)}
                  onSetHero={() => onSetHero(p.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortablePhoto({
  photo,
  onDelete,
  onSetHero,
}: {
  photo: PhotoWithUrl;
  onDelete: () => void;
  onSetHero: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: photo.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group border rounded overflow-hidden bg-white">
      <div className="relative aspect-[4/3] cursor-move" {...attributes} {...listeners}>
        <Image
          src={photo.url}
          alt=""
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover"
          unoptimized
        />
      </div>
      {photo.is_hero && (
        <span className="absolute top-1 left-1 bg-yellow-400 text-black text-xs font-bold px-1.5 py-0.5 rounded">
          ★ HERO
        </span>
      )}
      <div className="flex items-center justify-between p-1.5 text-xs">
        {photo.is_hero ? (
          <span className="text-gray-400">Principale</span>
        ) : (
          <button
            type="button"
            onClick={onSetHero}
            className="text-blue-700 hover:underline"
          >
            Marquer hero
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="text-red-600 hover:underline"
        >
          Supprimer
        </button>
      </div>
    </div>
  );
}
