"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  FolderKanban,
  GitBranch,
  Layers,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import type {
  MeetingAnalysis,
  MeetingTask,
  SavedMeeting,
} from "../types/meeting";
import { uploadAndAnalyzeAudio, type AnalyzeProgress } from "../lib/analyze-client";
import { buildMindMapTree } from "../lib/mindmap-builder";
import { formatSeconds } from "../lib/mime";
import { createSampleMeeting } from "../lib/sample-meeting";
import {
  clearAllMeetings,
  deleteMeeting,
  getAudioBlob,
  getStoredApiKey,
  getStoredPasscode,
  listMeetings,
  saveMeeting,
  setStoredApiKey,
  setStoredPasscode,
  updateMeetingAnalysis,
} from "../lib/storage";
import { ApiKeyModal } from "../components/ApiKeyModal";
import { AudioInputPanel } from "../components/AudioInputPanel";
import { AudioPlayerBar, type AudioPlayerHandle } from "../components/AudioPlayerBar";
import { ExportMenu } from "../components/ExportMenu";
import { HeaderBar } from "../components/HeaderBar";
import { HistorySidebar } from "../components/HistorySidebar";
import {
  InstallAppModal,
  type BeforeInstallPromptEvent,
} from "../components/InstallAppModal";
import { BriefView } from "../components/views/BriefView";
import { MindMapView } from "../components/views/MindMapView";
import { TasksView } from "../components/views/TasksView";
import { TopicsView } from "../components/views/TopicsView";
import { TranscriptView } from "../components/views/TranscriptView";

type ResultTab = "topics" | "tasks" | "mindmap" | "brief" | "transcript";

const RESULT_TABS: Array<{
  id: ResultTab;
  label: string;
  icon: typeof Layers;
}> = [
  { id: "topics", label: "แยกตามหัวข้อ", icon: Layers },
  { id: "tasks", label: "บอร์ดงาน", icon: FolderKanban },
  { id: "mindmap", label: "Mind Map", icon: GitBranch },
  { id: "brief", label: "ภาพรวม & มติ", icon: Sparkles },
  { id: "transcript", label: "บทถอดเสียง", icon: MessageSquareText },
];

export default function HomePage() {
  const [meetings, setMeetings] = useState<SavedMeeting[]>([]);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>("topics");
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);

  // Auth / config state
  const [hasServerKey, setHasServerKey] = useState(false);
  const [requiresPasscode, setRequiresPasscode] = useState(false);
  const [userApiKey, setUserApiKey] = useState("");
  const [userPasscode, setUserPasscode] = useState("");
  const [apiModalOpen, setApiModalOpen] = useState(false);

  // PWA Install state
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  // Audio playback URL for active meeting
  const [activeAudioUrl, setActiveAudioUrl] = useState<string | null>(null);
  const audioPlayerRef = useRef<AudioPlayerHandle | null>(null);

  // Processing state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState<AnalyzeProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load local IndexedDB meetings + localStorage keys + server config
  useEffect(() => {
    setUserApiKey(getStoredApiKey());
    setUserPasscode(getStoredPasscode());

    listMeetings()
      .then((rows) => {
        setMeetings(rows);
      })
      .catch(() => {
        setMeetings([]);
      });

    fetch("/api/config")
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg: { hasServerKey?: boolean; requiresPasscode?: boolean } | null) => {
        if (cfg) {
          setHasServerKey(Boolean(cfg.hasServerKey));
          setRequiresPasscode(Boolean(cfg.requiresPasscode));
        }
      })
      .catch(() => undefined);

    // PWA standalone detection, service worker registration & install prompt capture
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const navStandalone = Boolean(
      (window.navigator as Navigator & { standalone?: boolean }).standalone
    );
    setIsStandalone(standaloneQuery.matches || navStandalone);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setDeferredInstallPrompt(null);
      setIsStandalone(true);
      setInstallModalOpen(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const activeMeeting = useMemo(
    () => meetings.find((m) => m.id === activeMeetingId) || null,
    [meetings, activeMeetingId]
  );

  // Load local audio Blob URL whenever active meeting changes
  useEffect(() => {
    let revokedUrl: string | null = null;
    let cancelled = false;

    if (!activeMeeting || !activeMeeting.hasLocalAudio) {
      setActiveAudioUrl(null);
      return;
    }

    getAudioBlob(activeMeeting.id)
      .then((blob) => {
        if (cancelled) return;
        if (blob) {
          const url = URL.createObjectURL(blob);
          revokedUrl = url;
          setActiveAudioUrl(url);
        } else {
          setActiveAudioUrl(null);
        }
      })
      .catch(() => {
        if (!cancelled) setActiveAudioUrl(null);
      });

    return () => {
      cancelled = true;
      if (revokedUrl) {
        URL.revokeObjectURL(revokedUrl);
      }
    };
  }, [activeMeeting]);

  const handleSaveApiConfig = (apiKey: string, passcode: string) => {
    setStoredApiKey(apiKey);
    setStoredPasscode(passcode);
    setUserApiKey(apiKey);
    setUserPasscode(passcode);
    setErrorMessage(null);
  };

  const handleLoadSample = useCallback(async () => {
    const sample = createSampleMeeting();
    try {
      await saveMeeting(sample);
    } catch {
      // Even if IndexedDB is restricted, still display in state
    }
    setMeetings((prev) => {
      const withoutSample = prev.filter((m) => m.id !== sample.id);
      return [sample, ...withoutSample];
    });
    setActiveMeetingId(sample.id);
    setActiveTab("topics");
    setErrorMessage(null);
  }, []);

  const handleNewMeeting = () => {
    setActiveMeetingId(null);
    setErrorMessage(null);
  };

  const handleStartAnalyze = async (payload: {
    file: Blob;
    fileName: string;
    sourceType: "upload" | "record";
    durationSec?: number;
    meetingContext: string;
  }) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsAnalyzing(true);
    setErrorMessage(null);
    setProgress({
      stage: "preparing",
      percent: 2,
      message: "กำลังเตรียมไฟล์เสียง...",
    });

    try {
      const analysis = await uploadAndAnalyzeAudio({
        file: payload.file,
        fileName: payload.fileName,
        meetingContext: payload.meetingContext,
        apiKey: userApiKey,
        passcode: userPasscode,
        signal: controller.signal,
        onProgress: setProgress,
      });

      const id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `meeting-${Date.now()}`;

      const now = Date.now();
      const newMeeting: SavedMeeting = {
        id,
        createdAt: now,
        updatedAt: now,
        sourceType: payload.sourceType,
        fileName: payload.fileName,
        durationSec: payload.durationSec,
        hasLocalAudio: true,
        analysis,
      };

      await saveMeeting(newMeeting, payload.file).catch(() => undefined);
      setMeetings((prev) => [newMeeting, ...prev]);
      setActiveMeetingId(id);
      setActiveTab("topics");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        setErrorMessage("ยกเลิกการวิเคราะห์เสียงแล้ว");
      } else {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "เกิดข้อผิดพลาดระหว่างประมวลผลไฟล์เสียง"
        );
      }
    } finally {
      setIsAnalyzing(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  };

  const handleCancelAnalyze = () => {
    abortControllerRef.current?.abort();
  };

  const persistUpdatedAnalysis = useCallback(
    (meetingId: string, nextAnalysis: MeetingAnalysis) => {
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === meetingId
            ? { ...m, updatedAt: Date.now(), analysis: nextAnalysis }
            : m
        )
      );
      updateMeetingAnalysis(meetingId, nextAnalysis).catch(() => undefined);
    },
    []
  );

  const handleUpdateTasks = useCallback(
    (nextTasks: MeetingTask[]) => {
      if (!activeMeeting) return;
      const nextAnalysis: MeetingAnalysis = {
        ...activeMeeting.analysis,
        tasks: nextTasks,
        mindMap: buildMindMapTree({
          meetingTitle: activeMeeting.analysis.meetingTitle,
          topics: activeMeeting.analysis.topics,
          tasks: nextTasks,
          blockers: activeMeeting.analysis.blockers,
        }),
      };
      persistUpdatedAnalysis(activeMeeting.id, nextAnalysis);
    },
    [activeMeeting, persistUpdatedAnalysis]
  );

  const handleToggleTaskDone = useCallback(
    (taskId: string) => {
      if (!activeMeeting) return;
      const nextTasks = activeMeeting.analysis.tasks.map((t) =>
        t.id === taskId
          ? { ...t, status: (t.status === "done" ? "todo" : "done") as MeetingTask["status"] }
          : t
      );
      handleUpdateTasks(nextTasks);
    },
    [activeMeeting, handleUpdateTasks]
  );

  const handleDeleteMeeting = async (id: string) => {
    await deleteMeeting(id).catch(() => undefined);
    setMeetings((prev) => prev.filter((m) => m.id !== id));
    if (activeMeetingId === id) {
      setActiveMeetingId(null);
    }
  };

  const handleClearAll = async () => {
    await clearAllMeetings().catch(() => undefined);
    setMeetings([]);
    setActiveMeetingId(null);
  };

  const handleSeek = (seconds: number) => {
    audioPlayerRef.current?.seekTo(seconds);
  };

  const handlePromptInstall = async () => {
    if (!deferredInstallPrompt) return;
    try {
      await deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDeferredInstallPrompt(null);
        setInstallModalOpen(false);
      }
    } catch {
      // Prompt dismissed or unsupported
    }
  };

  const aiReady = Boolean(userApiKey.trim()) || hasServerKey;

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <HeaderBar
        hasServerKey={hasServerKey}
        hasUserKey={Boolean(userApiKey.trim())}
        isStandalone={isStandalone}
        onToggleSidebar={() => setSidebarMobileOpen(true)}
        onNewMeeting={handleNewMeeting}
        onLoadSample={handleLoadSample}
        onOpenApiModal={() => setApiModalOpen(true)}
        onOpenInstallModal={() => setInstallModalOpen(true)}
      />

      <div className="mx-auto flex w-full max-w-[1440px] flex-1">
        <HistorySidebar
          meetings={meetings}
          activeId={activeMeetingId}
          isOpenMobile={sidebarMobileOpen}
          onCloseMobile={() => setSidebarMobileOpen(false)}
          onSelect={(id) => {
            setActiveMeetingId(id);
            setErrorMessage(null);
          }}
          onDelete={handleDeleteMeeting}
          onClearAll={handleClearAll}
        />

        <main className="flex-1 min-w-0 px-4 py-6 sm:px-6 lg:px-8 print-full">
          {!activeMeeting ? (
            <AudioInputPanel
              isAnalyzing={isAnalyzing}
              progress={progress}
              errorMessage={errorMessage}
              aiReady={aiReady}
              onStartAnalyze={handleStartAnalyze}
              onCancelAnalyze={handleCancelAnalyze}
              onLoadSample={handleLoadSample}
              onOpenApiModal={() => setApiModalOpen(true)}
            />
          ) : (
            <div className="mx-auto max-w-5xl space-y-5">
              {/* Meeting Title & Export Bar */}
              <div className="rounded-2xl border border-line bg-white p-5 shadow-sm space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className="inline-flex items-center gap-1 rounded-md bg-paper border border-line px-2 py-0.5 font-medium text-ink">
                        <FileText className="h-3 w-3 text-accent" />
                        {activeMeeting.sourceType === "demo"
                          ? "ข้อมูลตัวอย่าง"
                          : activeMeeting.sourceType === "record"
                            ? "บันทึกเสียงสด"
                            : "ไฟล์อัปโหลด"}
                      </span>
                      <span>
                        {new Date(activeMeeting.createdAt).toLocaleString("th-TH", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                      {activeMeeting.durationSec ? (
                        <span>· ยาว {formatSeconds(activeMeeting.durationSec)}</span>
                      ) : null}
                      <span>· {activeMeeting.analysis.topics.length} หัวข้อ</span>
                      <span>· {activeMeeting.analysis.tasks.length} งาน</span>
                    </div>

                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
                      {activeMeeting.analysis.meetingTitle}
                    </h1>
                  </div>

                  <ExportMenu meeting={activeMeeting} />
                </div>

                {/* Persistent Audio Player if local audio blob exists */}
                <AudioPlayerBar
                  ref={audioPlayerRef}
                  audioUrl={activeAudioUrl}
                  fileName={activeMeeting.fileName}
                />
              </div>

              {/* 5 Result Tabs */}
              <div className="no-print flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-line bg-white p-1.5 shadow-sm">
                {RESULT_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  const countBadge =
                    tab.id === "topics"
                      ? activeMeeting.analysis.topics.length
                      : tab.id === "tasks"
                        ? activeMeeting.analysis.tasks.length
                        : null;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-medium transition-all ${
                        isActive
                          ? "bg-accent text-white shadow-sm"
                          : "text-muted hover:bg-paper hover:text-ink"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{tab.label}</span>
                      {countBadge !== null && (
                        <span
                          className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                            isActive
                              ? "bg-white/20 text-white"
                              : "bg-paper text-ink border border-line"
                          }`}
                        >
                          {countBadge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Active Tab Panel */}
              <div>
                {activeTab === "topics" && (
                  <TopicsView
                    topics={activeMeeting.analysis.topics}
                    tasks={activeMeeting.analysis.tasks}
                    hasAudio={Boolean(activeAudioUrl)}
                    onSeek={handleSeek}
                    onToggleTaskDone={handleToggleTaskDone}
                    onJumpToTasks={() => setActiveTab("tasks")}
                  />
                )}

                {activeTab === "tasks" && (
                  <TasksView
                    meeting={activeMeeting}
                    hasAudio={Boolean(activeAudioUrl)}
                    onSeek={handleSeek}
                    onUpdateTasks={handleUpdateTasks}
                  />
                )}

                {activeTab === "mindmap" && (
                  <MindMapView
                    meetingTitle={activeMeeting.analysis.meetingTitle}
                    mindMap={activeMeeting.analysis.mindMap}
                  />
                )}

                {activeTab === "brief" && (
                  <BriefView analysis={activeMeeting.analysis} />
                )}

                {activeTab === "transcript" && (
                  <TranscriptView
                    transcript={activeMeeting.analysis.transcript}
                    topics={activeMeeting.analysis.topics}
                    hasAudio={Boolean(activeAudioUrl)}
                    onSeek={handleSeek}
                  />
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <ApiKeyModal
        isOpen={apiModalOpen}
        hasServerKey={hasServerKey}
        requiresPasscode={requiresPasscode}
        currentApiKey={userApiKey}
        currentPasscode={userPasscode}
        onClose={() => setApiModalOpen(false)}
        onSave={handleSaveApiConfig}
      />

      <InstallAppModal
        isOpen={installModalOpen}
        canPromptInstall={Boolean(deferredInstallPrompt)}
        onPromptInstall={handlePromptInstall}
        onClose={() => setInstallModalOpen(false)}
      />
    </div>
  );
}
