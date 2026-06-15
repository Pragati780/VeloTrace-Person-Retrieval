"use client";

import { useState, useCallback } from "react";
import VideoUpload from "@/components/VideoUpload";
import AttributeBuilder from "@/components/AttributeBuilder";
import AnalysisProgress from "@/components/AnalysisProgress";
import ResultsGrid from "@/components/ResultsGrid";
import {
  submitJob,
  subscribeToProgress,
  AttributeRequest,
  PipelineResult,
  ProgressEvent,
} from "@/lib/api";

type Phase = "setup" | "processing" | "results";

export default function Home() {
  const [video, setVideo]           = useState<File | null>(null);
  const [attributes, setAttributes] = useState<AttributeRequest[]>([
    { name: "red shirt", priority: "high" },
  ]);
  const [phase, setPhase]           = useState<Phase>("setup");
  const [progress, setProgress]     = useState<ProgressEvent | null>(null);
  const [result, setResult]         = useState<PipelineResult | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const handleAnalyse = useCallback(async () => {
    if (!video || !attributes.length) return;
    setError(null);
    setPhase("processing");
    setProgress({ step: "uploading", progress: 1, message: "Uploading video…" });

    try {
      const jobId = await submitJob(video, attributes);

      subscribeToProgress(
        jobId,
        (e) => setProgress(e),
        (r) => { setResult(r); setPhase("results"); },
        (msg) => { setError(msg); setPhase("setup"); }
      );
    } catch (e: unknown) {
      setError((e as Error).message);
      setPhase("setup");
    }
  }, [video, attributes]);

  const reset = () => {
    setVideo(null);
    setAttributes([{ name: "red shirt", priority: "high" }]);
    setPhase("setup");
    setProgress(null);
    setResult(null);
    setError(null);
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      {/* ── Header ── */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="6" cy="6" r="4" stroke="white" strokeWidth="1.5"/>
            <path d="M10 10L14 14" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="6" cy="6" r="1.5" fill="white"/>
          </svg>
        </div>
        <div>
          <span className="font-semibold text-sm tracking-tight">PersonFinder AI</span>
          <span className="ml-3 text-xs text-white/40">Attribute-Based Person Retrieval</span>
        </div>
        {phase !== "setup" && (
          <button
            onClick={reset}
            className="ml-auto text-xs text-white/40 hover:text-white/80 transition-colors"
          >
            ← New search
          </button>
        )}
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* ── Error banner ── */}
        {error && (
          <div className="mb-6 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* ── Setup phase ── */}
        {phase === "setup" && (
          <div className="space-y-8">
            <div>
              <h1 className="text-3xl font-bold tracking-tight mb-1">
                Find anyone in a video
              </h1>
              <p className="text-white/40 text-sm">
                Upload surveillance footage, describe the person — our AI does the rest.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <VideoUpload video={video} onSelect={setVideo} />
              <AttributeBuilder attributes={attributes} onChange={setAttributes} />
            </div>

            <button
              onClick={handleAnalyse}
              disabled={!video || !attributes.length}
              className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500
                         disabled:opacity-30 disabled:cursor-not-allowed
                         font-medium text-sm transition-colors"
            >
              Analyse video
            </button>
          </div>
        )}

        {/* ── Processing phase ── */}
        {phase === "processing" && progress && (
          <AnalysisProgress progress={progress} attributes={attributes} />
        )}

        {/* ── Results phase ── */}
        {phase === "results" && result && (
          <ResultsGrid result={result} attributes={attributes} onReset={reset} />
        )}
      </div>
    </main>
  );
}
