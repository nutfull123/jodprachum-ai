"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Download, Pause, Play, Volume2 } from "lucide-react";
import { formatSeconds } from "../lib/mime";

export interface AudioPlayerHandle {
  seekTo: (seconds: number) => void;
}

interface AudioPlayerBarProps {
  audioUrl: string | null;
  fileName: string;
}

const PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const;

export const AudioPlayerBar = forwardRef<AudioPlayerHandle, AudioPlayerBarProps>(
  function AudioPlayerBar({ audioUrl, fileName }, ref) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [rateIndex, setRateIndex] = useState(0);

    useEffect(() => {
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }, [audioUrl]);

    useImperativeHandle(ref, () => ({
      seekTo(seconds: number) {
        const el = audioRef.current;
        if (!el || !audioUrl) return;
        const safeSec = Math.max(0, seconds);
        el.currentTime = safeSec;
        setCurrentTime(safeSec);
        el.play()
          .then(() => setIsPlaying(true))
          .catch(() => undefined);
      },
    }));

    if (!audioUrl) {
      return null;
    }

    const togglePlay = () => {
      const el = audioRef.current;
      if (!el) return;
      if (el.paused) {
        el.play()
          .then(() => setIsPlaying(true))
          .catch(() => undefined);
      } else {
        el.pause();
        setIsPlaying(false);
      }
    };

    const cycleRate = () => {
      const nextIdx = (rateIndex + 1) % PLAYBACK_RATES.length;
      setRateIndex(nextIdx);
      if (audioRef.current) {
        audioRef.current.playbackRate = PLAYBACK_RATES[nextIdx];
      }
    };

    return (
      <div className="no-print rounded-xl border border-line bg-white px-4 py-2.5 shadow-sm">
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            if (Number.isFinite(e.currentTarget.duration)) {
              setDuration(e.currentTarget.duration);
            }
          }}
          onEnded={() => setIsPlaying(false)}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-dark transition-colors"
            aria-label={isPlaying ? "หยุดเล่นเสียง" : "เล่นเสียง"}
          >
            {isPlaying ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5 translate-x-[1px]" />
            )}
          </button>

          <div className="flex min-w-[160px] flex-1 items-center gap-2.5">
            <span className="font-mono text-xs text-muted w-11 text-right shrink-0">
              {formatSeconds(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration > 0 ? duration : 100}
              step={0.5}
              value={Math.min(currentTime, duration || 100)}
              onChange={(e) => {
                const val = Number(e.target.value);
                setCurrentTime(val);
                if (audioRef.current) {
                  audioRef.current.currentTime = val;
                }
              }}
              className="h-1.5 flex-1 cursor-pointer accent-[#0F766E]"
              aria-label="เลื่อนเวลาเสียง"
            />
            <span className="font-mono text-xs text-muted w-11 shrink-0">
              {formatSeconds(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted max-w-[180px] truncate">
              <Volume2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{fileName}</span>
            </span>

            <button
              type="button"
              onClick={cycleRate}
              className="rounded-md border border-line bg-paper px-2 py-1 font-mono text-xs font-medium text-ink hover:bg-[#efede6]"
              title="ปรับความเร็วในการฟัง"
            >
              {PLAYBACK_RATES[rateIndex]}x
            </button>

            <a
              href={audioUrl}
              download={fileName || "meeting-audio"}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:bg-[#efede6]"
              title="ดาวน์โหลดไฟล์เสียง"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">เสียง</span>
            </a>
          </div>
        </div>
      </div>
    );
  }
);
