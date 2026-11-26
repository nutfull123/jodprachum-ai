"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  FolderKanban,
  GitBranch,
  Layers,
  MessageSquareText,
  PenTool,
  Sparkles,
} from "lucide-react";
import type {
  MeetingAnalysis,
  MeetingTask,
  SavedMeeting,
} from "../types/meeting";
import type { ShootNotebook } from "../types/notebook";
import { uploadAndAnalyzeAudio, type AnalyzeProgress } from "../lib/analyze-client";
import { buildMindMapTree } from "../lib/mindmap-builder";
import { formatSeconds } from "../lib/mime";
import {
  createEmptyNotebook,
  createNotebookFromMeeting,
} from "../lib/notebook-crdt";
import { createSampleMeeting } from "../lib/sample-meeting";
import {
  clearAllMeetings,
  deleteMeeting,
  deleteNotebook,
  getAudioBlob,
  getStoredApiKey,
  getStoredPasscode,
  getStoredTheme,
  listMeetings,
  listNotebooks,
  saveMeeting,
  saveNotebook,
  setStoredApiKey,
  setStoredPasscode,
  setStoredTheme,
  updateMeetingAnalysis,
} from "../lib/storage";
import { ApiKeyModal } from "../components/ApiKeyModal";
import { AudioInputPanel } from "../components/AudioInputPanel";
import { AudioPlayerBar, type AudioPlayerHandle } from "../components/AudioPlayerBar";
import { ExportMenu } from "../components/ExportMenu";
import { HeaderBar, type WorkspaceMode } from "../components/HeaderBar";
import { HistorySidebar } from "../components/HistorySidebar";
import {
  InstallAppModal,
  type BeforeInstallPromptEvent,
} from "../components/InstallAppModal";
import { ShootNoteWorkspace } from "../components/notebook/ShootNoteWorkspace";
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

function createStarterNotebook(): ShootNotebook {
  const now = Date.now();
  return {
    id: "starter-shootnote-welcome",
    kind: "notebook",
    title: "สมุดจด ShootNote · เริ่มต้นใช้งาน",
    paperTemplate: "lined",
    pageHeight: 1600,
    strokes: [],
    items: [
      {
        id: "starter-card-1",
        type: "meeting_card",
        x: 56,
        y: 52,
        width: 888,
        height: 210,
        zIndex: 1,
        title: "✏️ ยินดีต้อนรับสู่ ShootNote (สมุดจดสไตล์ GoodNotes)",
        text: "• ใช้ Apple Pencil บน iPad หรือเมาส์/นิ้วเขียนวาดได้ทันที (กด 'ปากกา iPad' ด้านบนเพื่อเปิดโหมดกันมือโดนจอ)\n• กด 'โพสต์อิท' / 'สติกเกอร์' / 'รูปทรง' / 'แนบภาพ' / 'แนบคลิป/เสียง' เพื่อตกแต่งโน้ต\n• ข้อมูลทั้งหมดบันทึกอัตโนมัติในเครื่องคุณ และกด 'แชร์ทำร่วมกัน' เพื่อส่งลิงก์ให้เพื่อนเขียนพร้อมกันแบบเรียลไทม์ได้เลย",
        bgColor: "#EFFAF8",
        color: "#1C1B18",
        fontSize: 15,
        updatedAt: now,
      },
      {
        id: "starter-sticky-1",
        type: "sticky",
        x: 56,
        y: 294,
        width: 340,
        height: 190,
        zIndex: 2,
        title: "📌 ลองเขียนหรือแปะโน้ตตรงนี้",
        text: "ดับเบิลคลิกที่โพสต์อิทเพื่อพิมพ์แก้ไข หรือสลับไปที่แท็บ 'ถอดเสียงประชุม AI' แล้วกดส่งสรุปประชุมมาเขียนตกแต่งต่อบนหน้านี้ได้!",
        bgColor: "#FEF9C3",
        color: "#1C1B18",
        fontSize: 14,
        updatedAt: now,
      },
      {
        id: "starter-sticker-1",
        type: "sticker",
        x: 440,
        y: 315,
        width: 110,
        height: 110,
        zIndex: 3,
        stickerEmoji: "🚀",
        stickerLabel: "พร้อมจด!",
        updatedAt: now,
      },
    ],
    metaUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export default function HomePage() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("notebook");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);

  // ShootNote notebooks state
  const [notebooks, setNotebooks] = useState<ShootNotebook[]>([]);
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [initialRoomCode, setInitialRoomCode] = useState<string | undefined>(
    undefined
  );

  // Meeting summarizer state
  const [meetings, setMeetings] = useState<SavedMeeting[]>([]);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>("topics");

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

  // Load local IndexedDB notebooks + meetings + localStorage keys + server config + PWA listeners
  useEffect(() => {
    const storedTheme = getStoredTheme();
    setTheme(storedTheme);
    document.documentElement.classList.toggle("dark", storedTheme === "dark");

    setUserApiKey(getStoredApiKey());
    setUserPasscode(getStoredPasscode());

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room")?.trim().toUpperCase();
    if (roomParam) {
      setInitialRoomCode(roomParam);
      setWorkspaceMode("notebook");
    }

    listNotebooks()
      .then((rows) => {
        if (rows.length > 0) {
          setNotebooks(rows);
          if (!roomParam) {
            setActiveNotebookId(rows[0].id);
          }
        } else if (!roomParam) {
          const starter = createStarterNotebook();
          setNotebooks([starter]);
          setActiveNotebookId(starter.id);
          saveNotebook(starter).catch(() => undefined);
        }
      })
      .catch(() => {
        const starter = createStarterNotebook();
        setNotebooks([starter]);
        setActiveNotebookId(starter.id);
      });

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
    setWorkspaceMode("meeting");
    setErrorMessage(null);
  }, []);

  const handleNewAction = () => {
    if (workspaceMode === "notebook") {
      const nb = createEmptyNotebook("notebook");
      setNotebooks((prev) => [nb, ...prev]);
      setActiveNotebookId(nb.id);
      saveNotebook(nb).catch(() => undefined);
    } else {
      setActiveMeetingId(null);
      setErrorMessage(null);
    }
  };

  const handleUpsertNotebook = useCallback((nb: ShootNotebook) => {
    setNotebooks((prev) => {
      const idx = prev.findIndex((item) => item.id === nb.id);
      if (idx === -1) {
        return [nb, ...prev];
      }
      const next = [...prev];
      next[idx] = nb;
      return next;
    });
  }, []);

  const handleDeleteNotebook = async (id: string) => {
    await deleteNotebook(id).catch(() => undefined);
    setNotebooks((prev) => {
      const remaining = prev.filter((n) => n.id !== id);
      if (activeNotebookId === id) {
        setActiveNotebookId(remaining[0]?.id || null);
      }
      return remaining;
    });
  };

  const handleSendMeetingToShootNote = async () => {
    if (!activeMeeting) return;
    const nb = createNotebookFromMeeting(activeMeeting);
    setNotebooks((prev) => [nb, ...prev]);
    setActiveNotebookId(nb.id);
    setWorkspaceMode("notebook");
    await saveNotebook(nb).catch(() => undefined);
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
          ? {
              ...t,
              status: (t.status === "done"
                ? "todo"
                : "done") as MeetingTask["status"],
            }
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

  const handleToggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    setStoredTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  };

  const aiReady = Boolean(userApiKey.trim()) || hasServerKey;

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <HeaderBar
        workspaceMode={workspaceMode}
        theme={theme}
        hasServerKey={hasServerKey}
        hasUserKey={Boolean(userApiKey.trim())}
        isStandalone={isStandalone}
        onChangeWorkspace={(mode) => {
          setWorkspaceMode(mode);
          setSidebarMobileOpen(false);
        }}
        onToggleTheme={handleToggleTheme}
        onToggleSidebar={() => setSidebarMobileOpen(true)}
        onNewAction={handleNewAction}
        onLoadSample={handleLoadSample}
        onOpenApiModal={() => setApiModalOpen(true)}
        onOpenInstallModal={() => setInstallModalOpen(true)}
      />

      {workspaceMode === "notebook" ? (
        <ShootNoteWorkspace
          notebooks={notebooks}
          activeNotebookId={activeNotebookId}
          initialRoomCode={initialRoomCode}
          sidebarMobileOpen={sidebarMobileOpen}
          onCloseSidebarMobile={() => setSidebarMobileOpen(false)}
          onSelectNotebook={setActiveNotebookId}
          onUpsertNotebook={handleUpsertNotebook}
          onDeleteNotebook={handleDeleteNotebook}
        />
      ) : (
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
                          {new Date(activeMeeting.createdAt).toLocaleString(
                            "th-TH",
                            {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }
                          )}
                        </span>
                        {activeMeeting.durationSec ? (
                          <span>
                            · ยาว {formatSeconds(activeMeeting.durationSec)}
                          </span>
                        ) : null}
                        <span>
                          · {activeMeeting.analysis.topics.length} หัวข้อ
                        </span>
                        <span>
                          · {activeMeeting.analysis.tasks.length} งาน
                        </span>
                      </div>

                      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
                        {activeMeeting.analysis.meetingTitle}
                      </h1>
                    </div>

                    <div className="no-print flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSendMeetingToShootNote}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-black transition-colors shadow-sm"
                      >
                        <PenTool className="h-3.5 w-3.5 text-amber-300" />
                        <span>ส่งเข้าสมุด ShootNote (เขียนปากกาต่อ)</span>
                      </button>
                      <ExportMenu meeting={activeMeeting} />
                    </div>
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
      )}

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
