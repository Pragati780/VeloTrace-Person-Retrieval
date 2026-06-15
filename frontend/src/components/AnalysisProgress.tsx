"use client";

import { AttributeRequest } from "@/lib/api";

interface ProgressEvent {
  step: string;
  progress: number;
  message: string;
}

interface Props {
  progress: ProgressEvent;
  attributes: AttributeRequest[];
}

const STEPS = [
  { id: "uploading",   label: "Upload video",         icon: "↑" },
  { id: "starting",    label: "Init AI models",        icon: "⚙" },
  { id: "sampling",    label: "Sample frames",         icon: "▤" },
  { id: "detecting",   label: "Detect persons",        icon: "◎" },
  { id: "attributes",  label: "Extract attributes",    icon: "◈" },
  { id: "ranking",     label: "Rank results",          icon: "≡" },
];

const STEP_ORDER = STEPS.map(s => s.id);

export default function AnalysisProgress({ progress, attributes }: Props) {
  const currentIdx = Math.max(0, STEP_ORDER.indexOf(progress.step));

  return (
    <div className="flex flex-col items-center gap-10 py-10">
      {/* Animated ring */}
      <div className="relative w-28 h-28">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 112 112">
          {/* Track */}
          <circle cx="56" cy="56" r="48" fill="none" stroke="white" strokeOpacity="0.06" strokeWidth="8"/>
          {/* Progress */}
          <circle
            cx="56" cy="56" r="48"
            fill="none"
            stroke="#7c3aed"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 48}`}
            strokeDashoffset={`${2 * Math.PI * 48 * (1 - progress.progress / 100)}`}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold">{progress.progress}%</span>
          <span className="text-xs text-white/40">complete</span>
        </div>
      </div>

      {/* Current message */}
      <div className="text-center">
        <p className="text-sm font-medium text-white">{progress.message}</p>
        <p className="text-xs text-white/40 mt-1">
          Matching against {attributes.length} attribute{attributes.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Step list */}
      <div className="w-full max-w-xs space-y-2">
        {STEPS.map((step, i) => {
          const done    = i < currentIdx;
          const active  = i === currentIdx;
          const pending = i > currentIdx;
          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all
                ${active  ? "bg-violet-500/15 border border-violet-500/30" : ""}
                ${done    ? "opacity-50" : ""}
                ${pending ? "opacity-20" : ""}
              `}
            >
              <span className={`
                w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono shrink-0
                ${done   ? "bg-green-500/20 text-green-400" : ""}
                ${active ? "bg-violet-500/30 text-violet-300" : ""}
                ${pending? "bg-white/5 text-white/20" : ""}
              `}>
                {done ? "✓" : step.icon}
              </span>
              <span className="text-sm">{step.label}</span>
              {active && (
                <span className="ml-auto flex gap-0.5">
                  {[0, 1, 2].map(d => (
                    <span
                      key={d}
                      className="w-1 h-1 rounded-full bg-violet-400 animate-bounce"
                      style={{ animationDelay: `${d * 0.15}s` }}
                    />
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Attributes being searched */}
      <div className="w-full max-w-xs">
        <p className="text-xs text-white/30 mb-2">Searching for</p>
        <div className="flex flex-wrap gap-1.5">
          {attributes.map((a, i) => (
            <span
              key={i}
              className={`px-2 py-1 rounded-md text-xs
                ${a.priority === "high"   ? "bg-red-500/20 text-red-300"    : ""}
                ${a.priority === "medium" ? "bg-amber-500/20 text-amber-300" : ""}
                ${a.priority === "low"    ? "bg-white/10 text-white/50"      : ""}
              `}
            >
              {a.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
