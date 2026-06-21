/**
 * api.ts — typed client for the Node.js backend
 *
 * All network calls go through these functions.
 * Components stay clean and never touch fetch() directly.
 */
 
const BACKEND =
  "https://velotrace-person-retrieval-production.up.railway.app";
 
export interface AttributeRequest {
  name: string;
  priority: "high" | "medium" | "low";
}
 
export interface MatchResult {
  detection_id: string;
  frame_number: number;
  timestamp_sec: number;
  timestamp_fmt: string;
  image_url: string;
  attribute_scores: Record<string, number>;
  weighted_confidence: number;
  confidence_pct: number;
}
 
export interface PipelineResult {
  job_id: string;
  video_duration_sec: number;
  total_persons_detected: number;
  matches: MatchResult[];
}
 
/** Upload video + attributes; returns jobId. */
export async function submitJob(
  video: File,
  attributes: AttributeRequest[]
): Promise<string> {
  const form = new FormData();
  form.append("video", video);
  form.append("attributes", JSON.stringify(attributes));
 
  const res = await fetch(`${BACKEND}/api/analyse`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Upload failed");
  }
  const { jobId } = await res.json();
  return jobId;
}
 
export interface ProgressEvent {
  step: string;
  progress: number;
  message: string;
}
 
/**
 * Open an SSE stream and call callbacks for each event type.
 * Returns a cleanup function — call it to close the connection.
 */
export function subscribeToProgress(
  jobId: string,
  onProgress: (e: ProgressEvent) => void,
  onDone: (result: PipelineResult) => void,
  onError: (msg: string) => void
): () => void {
  const es = new EventSource(`${BACKEND}/api/progress/${jobId}`);
 
  es.addEventListener("progress", (e) => {
    try { onProgress(JSON.parse((e as MessageEvent).data)); } catch (_) {}
  });
 
  es.addEventListener("done", (e) => {
    try {
      onDone(JSON.parse((e as MessageEvent).data));
    } catch (_) {}
    es.close();
  });
 
  es.addEventListener("error", (e) => {
    try { onError(JSON.parse((e as MessageEvent).data).message); } catch (_) { onError("Connection error"); }
    es.close();
  });
 
  return () => es.close();
}