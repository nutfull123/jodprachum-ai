"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileAudio,
  KeyRound,
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  UploadCloud,
  X,
} from "lucide-react";
import type { AnalyzeProgress } from "../lib/analyze-client";
import { formatBytes, formatSeconds, normalizeAudioMimeType } from "../lib/mime";

export type InputMode = "upload" | "record";

interface AudioInputPanelProps {
  isAnalyzing: boolean;
  progress: AnalyzeProgress | null;
  errorMessage: string | null;
  aiReady: boolean;
  onStartAnalyze: (payload: {
    file: Blob;
    fileName: string;
    sourceType: "upload" | "record";
    durationSec?: number;
    meetingContext: string;
  }) => void;
  onCancelAnalyze: () => void;
  onLoadSample: () => void;
  onOpenApiModal: () => void;
}

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function detectBestRecorderMime(): string {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return "";
  }
  if (typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) || "";
}

function getFileExtensionForMime(mime: string): string {
  const lower = mime.toLowerCase();
  if (lower.includes("mp4")) return "m4a";
  if (lower.includes("ogg")) return "ogg";
  return "webm";
}

export function AudioInputPanel({
  isAnalyzing,
  progress,
  errorMessage,
  aiReady,
  onStartAnalyze,
  onCancelAnalyze,
  onLoadSample,
  onOpenApiModal,
}: AudioInputPanelProps) {
  const [mode, setMode] = useState<InputMode>("upload");
  const [meetingContext, setMeetingContext] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Uploaded file state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);

  // Recording state
  const [recState, setRecState] = useState<"idle" | "recording" | "paused" | "stopped">("idle");
  const [recSeconds, setRecSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedName, setRecordedName] = useState("recording.webm");
  const [micError, setMicError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Cleanup preview URLs & streams on unmount
  useEffect(() => {
    return () => {
      if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      stopMediaTracks();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopMediaTracks = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const handleSelectFile = (file: File | null | undefined) => {
    if (!file) return;
    if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
    setUploadedFile(file);
    setUploadPreviewUrl(URL.createObjectURL(file));
    setMicError(null);
  };

  const clearUploadedFile = () => {
    if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
    setUploadedFile(null);
    setUploadPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const startVisualizer = (stream: MediaStream) => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const c2d = canvas.getContext("2d");
        if (!c2d) return;

        analyser.getByteFrequencyData(dataArray);
        c2d.clearRect(0, 0, canvas.width, canvas.height);

        const bars = 28;
        const barWidth = Math.floor((canvas.width - (bars - 1) * 4) / bars);

        for (let i = 0; i < bars; i += 1) {
          const v = dataArray[i % bufferLength] / 255;
          const barHeight = Math.max(4, Math.round(v * (canvas.height - 6)));
          const x = i * (barWidth + 4);
          const y = Math.round((canvas.height - barHeight) / 2);

          c2d.fillStyle = v > 0.35 ? "#0F766E" : "#99D6CE";
          c2d.beginPath();
          c2d.roundRect(x, y, barWidth, barHeight, 3);
          c2d.fill();
        }

        rafRef.current = window.requestAnimationFrame(draw);
      };

      draw();
    } catch {
      // Waveform visualization is optional; continue recording without failing
    }
  };

  const startRecording = async () => {
    setMicError(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setMicError(
        "เบราว์เซอร์นี้ไม่รองรับการอัดเสียงผ่านไมโครโฟน หรือหน้าเว็บไม่ได้เปิดผ่าน HTTPS"
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const bestMime = detectBestRecorderMime();
      let recorder: MediaRecorder;
      try {
        recorder = bestMime
          ? new MediaRecorder(stream, {
              mimeType: bestMime,
              audioBitsPerSecond: 32000,
            })
          : new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
      } catch {
        recorder = bestMime
          ? new MediaRecorder(stream, { mimeType: bestMime })
          : new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const finalMime =
          recorder.mimeType || bestMime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: finalMime });
        const ext = getFileExtensionForMime(finalMime);
        const nowStamp = new Date()
          .toISOString()
          .slice(0, 16)
          .replace(/[T:]/g, "-");

        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        setRecordedName(`บันทึกประชุม-${nowStamp}.${ext}`);
        setRecState("stopped");
        stopMediaTracks();
      };

      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
        setRecordedUrl(null);
      }
      setRecordedBlob(null);
      setRecSeconds(0);
      setRecState("recording");

      recorder.start(1000);
      timerRef.current = window.setInterval(() => {
        setRecSeconds((prev) => prev + 1);
      }, 1000);
      startVisualizer(stream);
    } catch (err) {
      stopMediaTracks();
      const msg =
        err instanceof Error && err.name === "NotAllowedError"
          ? "ไม่ได้รับอนุญาตให้เข้าถึงไมโครโฟน กรุณากดอนุญาต (Allow) ที่แถบที่อยู่ของเบราว์เซอร์"
          : "ไม่สามารถเปิดไมโครโฟนได้ กรุณาตรวจสอบอุปกรณ์ไมค์หรือโยนไฟล์เสียงเข้าแทน";
      setMicError(msg);
    }
  };

  const pauseOrResumeRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recState === "recording") {
      recorder.pause();
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecState("paused");
    } else if (recState === "paused") {
      recorder.resume();
      timerRef.current = window.setInterval(() => {
        setRecSeconds((prev) => prev + 1);
      }, 1000);
      setRecState("recording");
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      stopMediaTracks();
      setRecState("idle");
    }
  };

  const resetRecording = () => {
    stopMediaTracks();
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecSeconds(0);
    setRecState("idle");
    setMicError(null);
  };

  const readyAudio =
    mode === "upload"
      ? uploadedFile
        ? {
            blob: uploadedFile,
            fileName: uploadedFile.name,
            sourceType: "upload" as const,
            durationSec: undefined,
          }
        : null
      : recordedBlob
        ? {
            blob: recordedBlob,
            fileName: recordedName,
            sourceType: "record" as const,
            durationSec: recSeconds,
          }
        : null;

  const handleSubmit = () => {
    if (!readyAudio || isAnalyzing) return;
    onStartAnalyze({
      file: readyAudio.blob,
      fileName: readyAudio.fileName,
      sourceType: readyAudio.sourceType,
      durationSec: readyAudio.durationSec,
      meetingContext,
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="text-center space-y-2 pt-2">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-muted shadow-sm">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          <span>ฟรี 100% · ข้อมูลแต่ละคนเก็บแยกเฉพาะบนเครื่องตัวเอง</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
          ถอดเสียงและสรุปงานประชุม
        </h1>
        <p className="text-sm text-muted max-w-xl mx-auto">
          โยนไฟล์เสียงเข้าหรือกดบันทึกเสียงสด ระบบจะแยกหัวข้อการประชุม
          แตกเป็นบอร์ดงาน (Tasks) และสร้าง Mind Map ให้ใช้งานต่อได้ทันที
        </p>
      </div>

      {!aiReady && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <KeyRound className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <span className="font-semibold">ยังไม่ได้ใส่คีย์ AI:</span>{" "}
              กรอก Gemini API Key ฟรีของคุณก่อนส่งวิเคราะห์เสียง (ขอฟรีใน 1 นาที
              ไม่ต้องผูกบัตร) หรือลองกดดูตัวอย่างสรุปประชุมก่อนได้เลย
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenApiModal}
            className="shrink-0 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 transition-colors"
          >
            ตั้งค่าคีย์ AI ฟรี
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-white p-4 sm:p-6 shadow-sm space-y-5">
        {/* Mode Switch Tabs */}
        <div className="grid grid-cols-2 rounded-xl bg-paper p-1 border border-line">
          <button
            type="button"
            disabled={isAnalyzing}
            onClick={() => setMode("upload")}
            className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all ${
              mode === "upload"
                ? "bg-white text-ink shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            <UploadCloud className="h-4 w-4 text-accent" />
            <span>โยนไฟล์เสียงเข้า</span>
          </button>
          <button
            type="button"
            disabled={isAnalyzing}
            onClick={() => setMode("record")}
            className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all ${
              mode === "record"
                ? "bg-white text-ink shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            <Mic className="h-4 w-4 text-rose-600" />
            <span>อัดเสียงประชุมสด</span>
          </button>
        </div>

        {/* Upload Zone */}
        {mode === "upload" && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*,.mp3,.m4a,.wav,.webm,.ogg,.aac,.flac,.mp4,.mov,.mkv,.3gp"
              className="hidden"
              onChange={(e) => handleSelectFile(e.target.files?.[0])}
            />

            {!uploadedFile ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleSelectFile(e.dataTransfer.files?.[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? "border-accent bg-accent-soft/60"
                    : "border-[#D6D3C9] bg-paper/60 hover:border-accent/60 hover:bg-paper"
                }`}
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <UploadCloud className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-ink">
                  ลากไฟล์เสียงมาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์
                </p>
                <p className="mt-1.5 text-xs text-muted">
                  รองรับ .mp3, .m4a, .wav, .webm, .ogg, .aac, .flac และวิดีโอ
                  .mp4 / .mov (ไฟล์ยาวเป็นชั่วโมงก็รองรับ)
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-paper p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                      <FileAudio className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">
                        {uploadedFile.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span>{formatBytes(uploadedFile.size)}</span>
                        <span>·</span>
                        <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] border border-line">
                          {normalizeAudioMimeType(
                            uploadedFile.name,
                            uploadedFile.type
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  {!isAnalyzing && (
                    <button
                      type="button"
                      onClick={clearUploadedFile}
                      className="rounded-lg p-1.5 text-muted hover:bg-white hover:text-ink"
                      aria-label="ลบไฟล์ที่เลือก"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {uploadPreviewUrl && (
                  <audio
                    controls
                    src={uploadPreviewUrl}
                    className="w-full h-9"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Live Record Zone */}
        {mode === "record" && (
          <div className="rounded-xl border border-line bg-paper p-5 space-y-4">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    recState === "recording"
                      ? "bg-rose-500 animate-pulse"
                      : recState === "paused"
                        ? "bg-amber-500"
                        : recState === "stopped"
                          ? "bg-emerald-600"
                          : "bg-stone-300"
                  }`}
                />
                <span className="text-xs font-medium text-muted">
                  {recState === "recording"
                    ? "กำลังบันทึกเสียง..."
                    : recState === "paused"
                      ? "พักการอัดชั่วคราว"
                      : recState === "stopped"
                        ? "บันทึกเสร็จแล้ว · พร้อมให้ AI สรุป"
                        : "กดเริ่มอัดเสียงเมื่อพร้อมประชุม"}
                </span>
              </div>

              <div className="font-mono text-3xl font-semibold tracking-tight text-ink">
                {formatSeconds(recSeconds)}
              </div>

              {(recState === "recording" || recState === "paused") && (
                <canvas
                  ref={canvasRef}
                  width={340}
                  height={48}
                  className="w-full max-w-[340px] h-12 rounded-lg bg-white border border-line px-2"
                />
              )}

              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                {recState === "idle" && (
                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onClick={startRecording}
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 transition-colors shadow-sm"
                  >
                    <Mic className="h-4 w-4" />
                    เริ่มอัดเสียงจากไมค์
                  </button>
                )}

                {(recState === "recording" || recState === "paused") && (
                  <>
                    <button
                      type="button"
                      onClick={pauseOrResumeRecording}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-[#f0eee8]"
                    >
                      {recState === "recording" ? (
                        <>
                          <Pause className="h-4 w-4" />
                          พักชั่วคราว
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4" />
                          อัดต่อ
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-black"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                      หยุดอัดเสียง
                    </button>
                  </>
                )}

                {recState === "stopped" && recordedUrl && (
                  <>
                    <a
                      href={recordedUrl}
                      download={recordedName}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3.5 py-2 text-xs font-medium text-ink hover:bg-[#f0eee8]"
                    >
                      <Download className="h-3.5 w-3.5 text-accent" />
                      ดาวน์โหลดไฟล์เสียงดิบสำรองไว้
                    </a>
                    {!isAnalyzing && (
                      <button
                        type="button"
                        onClick={resetRecording}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3.5 py-2 text-xs font-medium text-muted hover:text-ink"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        อัดใหม่อีกครั้ง
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {recState === "stopped" && recordedUrl && (
              <div className="pt-2 border-t border-line space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{recordedName}</span>
                  <span>{recordedBlob ? formatBytes(recordedBlob.size) : ""}</span>
                </div>
                <audio controls src={recordedUrl} className="w-full h-9" />
              </div>
            )}

            {micError && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{micError}</span>
              </div>
            )}

            <p className="text-[11px] text-muted text-center">
              คำแนะนำ: หากประชุมในห้อง วางไมค์ใกล้วงสนทนา หรือเปิดลำโพงชัดเจน
              (บันทึกเสียงได้ยาวต่อเนื่องและเก็บไว้เฉพาะในเครื่องคุณ)
            </p>
          </div>
        )}

        {/* Optional Context */}
        <div>
          <label
            htmlFor="meeting-context-input"
            className="block text-xs font-medium text-ink mb-1.5"
          >
            บริบทหรือรายชื่อผู้เข้าร่วม (ไม่บังคับ)
          </label>
          <input
            id="meeting-context-input"
            type="text"
            disabled={isAnalyzing}
            value={meetingContext}
            onChange={(e) => setMeetingContext(e.target.value)}
            placeholder="เช่น ประชุมวางแผนเปิดตัวสินค้า Q4 — พลอย, ต้น, นัท (ช่วยให้ AI สะกดชื่อคนและศัพท์เฉพาะแม่นขึ้น)"
            className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/80 focus:border-accent focus:bg-white focus:outline-none"
          />
        </div>

        {/* Error Box */}
        {errorMessage && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-xs text-rose-900">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
            {(errorMessage.includes("API Key") ||
              errorMessage.includes("คีย์") ||
              errorMessage.includes("Rate Limit") ||
              errorMessage.includes("Passcode")) && (
              <button
                type="button"
                onClick={onOpenApiModal}
                className="shrink-0 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100"
              >
                เปิดหน้าตั้งค่าคีย์ AI
              </button>
            )}
          </div>
        )}

        {/* Progress State or Submit Action */}
        {isAnalyzing && progress ? (
          <div className="rounded-xl border border-accent/30 bg-accent-soft/50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-accent-dark">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{progress.message}</span>
              </div>
              <span className="font-mono text-xs font-semibold text-accent-dark">
                {progress.percent}%
              </span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-white border border-accent/20">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <div className="flex items-center gap-3">
                <span
                  className={
                    progress.percent >= 40 ? "text-accent-dark font-medium" : ""
                  }
                >
                  {progress.percent >= 40 ? (
                    <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />
                  ) : null}
                  1. ส่งไฟล์เสียง
                </span>
                <span
                  className={
                    progress.percent >= 65 ? "text-accent-dark font-medium" : ""
                  }
                >
                  {progress.percent >= 65 ? (
                    <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />
                  ) : null}
                  2. ถอดความและแยกหัวข้อ
                </span>
                <span>3. สร้าง Task & Mind Map</span>
              </div>

              <button
                type="button"
                onClick={onCancelAnalyze}
                className="rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink hover:bg-paper"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              disabled={!readyAudio || isAnalyzing}
              onClick={handleSubmit}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-45 transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              <span>เริ่มถอดเสียงและสรุปแยกหัวข้อ</span>
            </button>

            <button
              type="button"
              onClick={onLoadSample}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-paper px-4 py-3 text-xs font-semibold text-ink hover:bg-[#efede6] transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-600" />
              <span>ดูตัวอย่างสรุปประชุมจริง</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
