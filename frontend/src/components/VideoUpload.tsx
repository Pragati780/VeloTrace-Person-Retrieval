"use client";

import { useRef, useState, DragEvent } from "react";

interface Props {
  video: File | null;
  onSelect: (f: File) => void;
}

export default function VideoUpload({ video, onSelect }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = (file: File) => {
    if (file && file.type.startsWith("video/")) onSelect(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
        Video file
      </label>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`
          relative flex flex-col items-center justify-center gap-3
          rounded-2xl border-2 border-dashed cursor-pointer
          transition-all min-h-[200px] p-6 text-center
          ${dragging
            ? "border-violet-400 bg-violet-500/10"
            : video
            ? "border-violet-500/50 bg-violet-500/5"
            : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
          }
        `}
      >
        {video ? (
          <>
            {/* Video icon */}
            <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-violet-400">
                <rect x="2" y="4" width="14" height="16" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M16 9l6-4v14l-6-4V9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white">{video.name}</p>
              <p className="text-xs text-white/40 mt-1">{formatSize(video.size)}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              Change video
            </button>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white/30">
                <path d="M12 16V8M12 8l-3 3M12 8l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 16v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <p className="text-sm text-white/60">Drop video here or <span className="text-violet-400">browse</span></p>
              <p className="text-xs text-white/30 mt-1">MP4, MKV, AVI · up to 500 MB</p>
            </div>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </div>
  );
}
