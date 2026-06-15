"use client";

import { useState } from "react";
import { PipelineResult, MatchResult, AttributeRequest } from "@/lib/api";

interface Props {
  result: PipelineResult;
  attributes: AttributeRequest[];
  onReset: () => void;
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

function confidenceColor(pct: number) {
  if (pct >= 80) return "text-green-400";
  if (pct >= 50) return "text-amber-400";
  return "text-red-400";
}

function confidenceBg(pct: number) {
  if (pct >= 80) return "bg-green-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function MatchCard({ match, attributes }: { match: MatchResult; attributes: AttributeRequest[] }) {
  const [expanded, setExpanded] = useState(false);
  const imgUrl = `${BACKEND}${match.image_url}`;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden hover:border-white/20 transition-all flex flex-col">
      <div className="relative bg-neutral-900 aspect-[3/4] overflow-hidden">
        <img
          src={imgUrl}
          alt={`Match at ${match.timestamp_fmt}`}
          className="w-full h-full object-cover"
        />
        <div className={`absolute top-2 right-2 px-2 py-1 rounded-lg text-xs font-bold bg-neutral-950/80 backdrop-blur-sm ${confidenceColor(match.confidence_pct)}`}>
          {match.confidence_pct}%
        </div>
      </div>
      <div className="p-3 flex flex-col gap-3 flex-1">
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-white/40">Match confidence</span>
            <span className={confidenceColor(match.confidence_pct)}>{match.confidence_pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${confidenceBg(match.confidence_pct)}`} style={{ width: `${match.confidence_pct}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/30 text-xs">time</span>
          <span className="font-mono text-sm font-semibold">{match.timestamp_fmt}</span>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-white/30 hover:text-white/60 transition-colors text-left">
          {expanded ? "hide" : "show"} breakdown
        </button>
        {expanded && (
          <div className="space-y-1.5">
            {attributes.map((attr) => {
              const score = match.attribute_scores[attr.name] ?? 0;
              const pct   = Math.round(score * 100);
              return (
                <div key={attr.name}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-white/50 truncate max-w-[140px]">{attr.name}</span>
                    <span className={confidenceColor(pct)}>{pct}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                    <div className={`h-full rounded-full ${confidenceBg(pct)}`} style={{ width: `${pct}%`, opacity: 0.7 }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResultsGrid({ result, attributes, onReset }: Props) {
  const [minPct, setMinPct] = useState(30);
  const [sortBy, setSortBy] = useState<"confidence" | "time">("confidence");

  const filtered = result.matches
    .filter(m => m.confidence_pct >= minPct)
    .sort((a, b) => sortBy === "confidence" ? b.weighted_confidence - a.weighted_confidence : a.timestamp_sec - b.timestamp_sec);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-2.5">
          <p className="text-xs text-white/40">Persons detected</p>
          <p className="text-lg font-bold">{result.total_persons_detected.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-2.5">
          <p className="text-xs text-white/40">Matches found</p>
          <p className="text-lg font-bold text-violet-400">{result.matches.length}</p>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-2.5">
          <p className="text-xs text-white/40">Video length</p>
          <p className="text-lg font-bold">{Math.floor(result.video_duration_sec / 60)}m {Math.round(result.video_duration_sec % 60)}s</p>
        </div>
        {result.matches.length > 0 && (
          <div className="rounded-xl bg-green-500/10 border border-green-500/30 px-4 py-2.5">
            <p className="text-xs text-green-400/60">Best match</p>
            <p className="text-lg font-bold text-green-400">{result.matches[0].confidence_pct}%</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs text-white/40">Min confidence</label>
          <input type="range" min={0} max={90} value={minPct} onChange={(e) => setMinPct(Number(e.target.value))} className="w-24 accent-violet-500" />
          <span className="text-xs font-mono text-white/60 w-8">{minPct}%</span>
        </div>
        <div className="flex gap-1 ml-auto">
          {(["confidence", "time"] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)} className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${sortBy === s ? "bg-violet-600 text-white" : "bg-white/5 text-white/40 hover:text-white/70"}`}>
              {s === "confidence" ? "By match %" : "By timestamp"}
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <p>No matches above {minPct}% confidence.</p>
          <button onClick={onReset} className="mt-4 text-violet-400 hover:text-violet-300 text-sm">Try again</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((match) => (
            <MatchCard key={match.detection_id} match={match} attributes={attributes} />
          ))}
        </div>
      )}
    </div>
  );
}
