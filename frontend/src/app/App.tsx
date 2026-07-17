import { useState, useEffect, useRef, useCallback, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send,
  Upload,
  Download,
  FileText,
  Wifi,
  WifiOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Activity,
  Database,
  Globe,
  BookOpen,
  ChevronRight,
  X,
  Plus,
  File,
  FolderOpen,
  Clock,
  Pause,
  Square,
  Play,
} from "lucide-react";
import {
  startTask,
  stopTask,
  stopAllTasks,
  pauseTask,
  resumeTask,
  uploadSessionFiles,
  listFiles,
  getDownloadUrl,
  getWsUrl,
  extractOutputPath,
  type FileItem,
  type MonitorEvent,
} from "@/api/agent";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface WSEvent {
  id: string;
  type: string;
  event: string;
  message: string;
  data: Record<string, unknown>;
  timestamp: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function isNearBottom(el: HTMLElement, threshold = 96): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

function scrollToBottom(el: HTMLElement | null, force = false) {
  if (!el) return;
  if (!force && !isNearBottom(el)) return;
  el.scrollTop = el.scrollHeight;
}

function eventIcon(event: string) {
  switch (event) {
    case "tool_start":
      return <Activity size={13} className="text-accent" />;
    case "tool_end":
      return <CheckCircle2 size={13} className="text-emerald-400/70" />;
    case "assistant_call":
      return <ChevronRight size={13} className="text-primary" />;
    case "task_result":
      return <CheckCircle2 size={13} className="text-emerald-400" />;
    case "task_cancelled":
      return <Square size={13} className="text-amber-400" />;
    case "task_paused":
      return <Pause size={13} className="text-amber-400" />;
    case "task_resumed":
      return <Play size={13} className="text-emerald-400" />;
    case "session_created":
      return <Plus size={13} className="text-muted-foreground" />;
    default:
      return <Clock size={13} className="text-muted-foreground" />;
  }
}

function assistantIcon(msg: string) {
  if (msg.includes("网络搜索")) return <Globe size={12} />;
  if (msg.includes("数据库")) return <Database size={12} />;
  if (msg.includes("RAGFlow") || msg.includes("知识库")) return <BookOpen size={12} />;
  return <Activity size={12} />;
}

const PARTIAL_RESULT_ID = "partial-result";

function upsertPartialResult(
  prev: ChatMessage[],
  content: string,
): ChatMessage[] {
  const filtered = prev.filter((m) => m.id !== PARTIAL_RESULT_ID);
  return [
    ...filtered,
    {
      id: PARTIAL_RESULT_ID,
      role: "assistant",
      content,
      timestamp: new Date(),
    },
  ];
}

const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-lg font-semibold text-foreground mb-2 mt-4 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-semibold text-foreground mb-2 mt-3">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold text-foreground mb-1 mt-2">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="text-sm text-foreground leading-relaxed mb-2 last:mb-0">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside text-sm text-foreground mb-2 space-y-0.5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside text-sm text-foreground mb-2 space-y-0.5">{children}</ol>
        ),
        li: ({ children }) => <li className="text-sm">{children}</li>,
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          return isBlock ? (
            <code className="block bg-background/60 rounded px-3 py-2 text-xs font-mono text-accent mb-2 overflow-x-auto whitespace-pre">
              {children}
            </code>
          ) : (
            <code className="bg-background/60 rounded px-1 py-0.5 text-xs font-mono text-accent">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="bg-background/60 rounded-md p-3 mb-2 overflow-x-auto text-xs font-mono">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto mb-2">
            <table className="text-xs border-collapse w-full">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-border px-2 py-1 text-left font-semibold text-muted-foreground bg-muted/50">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-border px-2 py-1">{children}</td>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary pl-3 text-muted-foreground italic mb-2">
            {children}
          </blockquote>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        hr: () => <hr className="border-border my-3" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
});

// ─── Task Control Buttons ─────────────────────────────────────────────────────

function PauseTaskButton({
  isPaused,
  onPause,
  onResume,
  pausing,
  className = "",
}: {
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  pausing?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={isPaused ? onResume : onPause}
      disabled={pausing}
      title={pausing ? "处理中…" : isPaused ? "恢复任务" : "暂停当前任务"}
      className={`shrink-0 w-10 h-10 flex items-center justify-center bg-amber-500 text-white rounded-lg disabled:opacity-40 hover:bg-amber-500/90 transition-colors ${className}`}
    >
      {pausing ? (
        <Loader2 size={16} className="animate-spin" />
      ) : isPaused ? (
        <Play size={16} />
      ) : (
        <Pause size={16} />
      )}
    </button>
  );
}

function StopTaskButton({
  onStop,
  stopping,
  className = "",
}: {
  onStop: () => void;
  stopping?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onStop}
      disabled={stopping}
      title={stopping ? "停止中…" : "停止当前任务"}
      className={`shrink-0 w-10 h-10 flex items-center justify-center bg-destructive text-destructive-foreground rounded-lg disabled:opacity-40 hover:bg-destructive/90 transition-colors ${className}`}
    >
      {stopping ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <Square size={16} />
      )}
    </button>
  );
}

function TaskControlButtons({
  isPaused,
  onPause,
  onResume,
  onStop,
  pausing,
  stopping,
  className = "",
}: {
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  pausing?: boolean;
  stopping?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <PauseTaskButton
        isPaused={isPaused}
        onPause={onPause}
        onResume={onResume}
        pausing={pausing}
      />
      <StopTaskButton onStop={onStop} stopping={stopping} />
    </div>
  );
}

// ─── Progress Sidebar ─────────────────────────────────────────────────────────

function ProgressSidebar({
  events,
  wsConnected,
  threadId,
}: {
  events: WSEvent[];
  wsConnected: boolean;
  threadId: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastEventId = events.length > 0 ? events[events.length - 1].id : null;

  useEffect(() => {
    scrollToBottom(scrollRef.current, true);
  }, [lastEventId]);

  return (
    <aside className="flex flex-col min-h-0 h-full border-r border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-primary" />
          <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
            执行进度
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {wsConnected ? (
            <Wifi size={12} className="text-emerald-400" />
          ) : (
            <WifiOff size={12} className="text-muted-foreground" />
          )}
          <span
            className={`text-[10px] font-mono ${
              wsConnected ? "text-emerald-400" : "text-muted-foreground"
            }`}
          >
            {wsConnected ? "已连接" : "未连接"}
          </span>
        </div>
      </div>

      {/* Thread ID */}
      {threadId && (
        <div className="px-4 py-2 border-b border-border shrink-0">
          <div className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">
            Thread
          </div>
          <div className="text-[10px] font-mono text-accent truncate">{threadId}</div>
        </div>
      )}

      {/* Timeline */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-3 px-3 space-y-0">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <Activity size={20} className="text-muted-foreground/40" />
            <span className="text-xs text-muted-foreground/50">等待任务启动…</span>
          </div>
        ) : (
          events.map((evt, i) => (
            <div key={evt.id} className="relative flex gap-3 pb-3">
              {/* connector line */}
              {i < events.length - 1 && (
                <div className="absolute left-[13px] top-5 bottom-0 w-px bg-border" />
              )}
              {/* dot */}
              <div className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary border border-border">
                {eventIcon(evt.event)}
              </div>
              {/* content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      evt.event === "task_result"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : evt.event === "task_cancelled"
                        ? "bg-amber-500/10 text-amber-400"
                        : evt.event === "task_paused"
                        ? "bg-amber-500/10 text-amber-400"
                        : evt.event === "task_resumed"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : evt.event === "tool_start"
                        ? "bg-accent/10 text-accent"
                        : evt.event === "tool_end"
                        ? "bg-emerald-500/10 text-emerald-400/80"
                        : evt.event === "file_generated"
                        ? "bg-primary/10 text-primary"
                        : evt.event === "assistant_call"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {evt.event}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono ml-auto shrink-0">
                    {formatTime(evt.timestamp)}
                  </span>
                </div>
                <p className="text-xs text-foreground/80 leading-relaxed break-words">
                  {evt.message}
                </p>
                {evt.event === "assistant_call" && (
                  <div className="flex items-center gap-1 mt-1">
                    {assistantIcon(evt.message)}
                    <span className="text-[10px] text-muted-foreground">
                      {evt.message.includes("网络搜索")
                        ? "网络搜索助手"
                        : evt.message.includes("数据库")
                        ? "数据库查询助手"
                        : evt.message.includes("RAGFlow")
                        ? "RAGFlow 助手"
                        : "子助手"}
                    </span>
                  </div>
                )}
                {evt.event === "tool_start" && evt.data?.tool_name && (
                  <div className="mt-1 font-mono text-[10px] text-accent/70 bg-accent/5 px-2 py-0.5 rounded">
                    {String(evt.data.tool_name)}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

// ─── File Panel ───────────────────────────────────────────────────────────────

function FilePanel({
  threadId,
  outputPath,
  refreshKey,
}: {
  threadId: string | null;
  outputPath: string | null;
  refreshKey?: number;
}) {
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [resultFiles, setResultFiles] = useState<FileItem[]>([]);
  const [fetchingFiles, setFetchingFiles] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setUploadFiles(Array.from(e.target.files));
    }
  };

  const handleUpload = async () => {
    if (!uploadFiles.length) return;
    if (!threadId) {
      setUploadStatus("请先发送问题以获取会话ID");
      return;
    }
    setUploading(true);
    setUploadStatus(null);
    try {
      const json = await uploadSessionFiles(uploadFiles, threadId);
      setUploadStatus(`已上传 ${json.files?.length ?? 0} 个文件`);
      setUploadFiles([]);
    } catch {
      setUploadStatus("上传失败，请检查后端连接");
    } finally {
      setUploading(false);
    }
  };

  const fetchResultFiles = useCallback(async () => {
    if (!outputPath) return;
    setFetchingFiles(true);
    setFileError(null);
    try {
      const json = await listFiles(outputPath);
      if (json.error) {
        setFileError(json.error);
      } else {
        setResultFiles(json.files ?? []);
      }
    } catch {
      setFileError("无法获取文件列表");
    } finally {
      setFetchingFiles(false);
    }
  }, [outputPath]);

  useEffect(() => {
    if (outputPath) fetchResultFiles();
  }, [outputPath, refreshKey, fetchResultFiles]);

  const handleDownload = (filePath: string, fileName: string) => {
    const url = getDownloadUrl(filePath);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
  };

  const removeFile = (idx: number) => {
    setUploadFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <aside className="flex flex-col min-h-0 h-full border-l border-border bg-card overflow-hidden">
      {/* Upload Section */}
      <div className="border-b border-border">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Upload size={14} className="text-primary" />
          <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
            文件上传
          </span>
        </div>

        <div className="p-3 space-y-2">
          {/* Drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border border-dashed border-border rounded-md p-4 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
          >
            <Upload size={18} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground text-center">
              点击选择文件
              <br />
              <span className="text-[10px] opacity-60">md / docx / pdf / xlsx</span>
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".md,.docx,.pdf,.xlsx,.txt"
            onChange={handleFileSelect}
          />

          {/* Selected files */}
          {uploadFiles.length > 0 && (
            <div className="space-y-1">
              {uploadFiles.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-secondary rounded px-2 py-1.5"
                >
                  <File size={11} className="text-muted-foreground shrink-0" />
                  <span className="text-[11px] text-foreground truncate flex-1">{f.name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatBytes(f.size)}
                  </span>
                  <button
                    onClick={() => removeFile(i)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {!threadId && (
            <div className="text-[10px] text-amber-400/80 bg-amber-400/5 border border-amber-400/20 rounded px-2 py-1.5">
              需先发送问题获取 Thread ID
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={uploading || uploadFiles.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground text-xs font-medium rounded py-2 disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            {uploading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Upload size={12} />
            )}
            {uploading ? "上传中…" : "上传"}
          </button>

          {uploadStatus && (
            <div className="text-[10px] text-emerald-400 bg-emerald-400/5 border border-emerald-400/20 rounded px-2 py-1.5">
              {uploadStatus}
            </div>
          )}
        </div>
      </div>

      {/* Result Files Section */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FolderOpen size={14} className="text-primary" />
            <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
              输出文件
            </span>
          </div>
          {outputPath && (
            <button
              onClick={fetchResultFiles}
              disabled={fetchingFiles}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              {fetchingFiles ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <Activity size={10} />
              )}
              刷新
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3">
          {!outputPath ? (
            <div className="flex flex-col items-center justify-center h-24 gap-2">
              <FileText size={18} className="text-muted-foreground/30" />
              <span className="text-[11px] text-muted-foreground/50 text-center">
                任务完成后
                <br />
                文件将显示于此
              </span>
            </div>
          ) : fileError ? (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded px-2 py-2">
              <AlertCircle size={12} />
              {fileError}
            </div>
          ) : resultFiles.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6">
              暂无输出文件
            </div>
          ) : (
            <div className="space-y-1.5">
              {resultFiles.map((f) => (
                <div
                  key={f.path}
                  className="group flex items-center gap-2.5 bg-secondary hover:bg-secondary/80 border border-border rounded-md px-3 py-2 transition-colors"
                >
                  <FileText size={13} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-foreground truncate">{f.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {formatBytes(f.size)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(f.path, f.name)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all"
                    title="下载"
                  >
                    <Download size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// ─── Chat Message Bubble ──────────────────────────────────────────────────────

const MessageBubble = memo(function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  const displayContent =
    !isUser && msg.content.length > 50000
      ? `${msg.content.slice(0, 50000)}\n\n---\n\n*（内容过长，完整版请从右侧文件面板下载）*`
      : msg.content;
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div
        className={`shrink-0 w-7 h-7 rounded flex items-center justify-center text-[10px] font-semibold font-mono ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-secondary border border-border text-accent"
        }`}
      >
        {isUser ? "U" : "AI"}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[78%] rounded-xl px-4 py-3 ${
          isUser
            ? "bg-primary/15 border border-primary/20 text-foreground"
            : "bg-card border border-border"
        }`}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed">{msg.content}</p>
        ) : (
          <MarkdownContent content={displayContent} />
        )}
        <div
          className={`text-[10px] text-muted-foreground font-mono mt-1.5 ${
            isUser ? "text-right" : "text-left"
          }`}
        >
          {msg.timestamp.toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
});

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [wsEvents, setWsEvents] = useState<WSEvent[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [fileRefreshKey, setFileRefreshKey] = useState(0);
  const [latestActivity, setLatestActivity] = useState("AI 助手处理中…");

  const wsRef = useRef<WebSocket | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const chatAutoScrollRef = useRef(true);
  const eventCounterRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const partialLoadedRef = useRef(false);
  const activeThreadIdRef = useRef<string | null>(null);
  const queryStartedAtRef = useRef(0);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    chatAutoScrollRef.current = isNearBottom(el);
  }, []);

  useEffect(() => {
    if (!chatAutoScrollRef.current) return;
    scrollToBottom(messagesScrollRef.current, true);
  }, [messages, isProcessing]);

  useEffect(() => {
    if (!isProcessing || !outputPath) return;

    let cancelled = false;

    const tryLoadLatestMd = async () => {
      if (cancelled) return;
      try {
        const json = await listFiles(outputPath);
        const startedAtSec = queryStartedAtRef.current / 1000;
        const mdFiles = (json.files ?? [])
          .filter((f) => f.name.endsWith(".md"))
          .filter((f) => f.mtime >= startedAtSec);
        if (!mdFiles.length) return;

        const latest = mdFiles[0];
        const res = await fetch(getDownloadUrl(latest.path));
        if (!res.ok || cancelled) return;

        const text = (await res.text()).trim();
        if (text && !cancelled) {
          setMessages((prev) => upsertPartialResult(prev, text));
          setFileRefreshKey((k) => k + 1);
        }
      } catch {
        // ignore polling errors
      }
    };

    void tryLoadLatestMd();
    const timer = setInterval(() => void tryLoadLatestMd(), 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isProcessing, outputPath]);

  const connectWebSocket = useCallback((tid: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      const ws = new WebSocket(getWsUrl(tid));
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        const heartbeat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 30000);
        (ws as WebSocket & { _heartbeat?: ReturnType<typeof setInterval> })._heartbeat = heartbeat;
        resolve();
      };

      ws.onclose = () => {
        setWsConnected(false);
      };

      ws.onerror = () => {
        setWsConnected(false);
        reject(new Error("WebSocket connection failed"));
      };

      ws.onmessage = (e) => {
        if (activeThreadIdRef.current !== tid) return;

        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "pong") return;

          if (msg.type === "monitor_event") {
            eventCounterRef.current += 1;
            const evt: WSEvent = {
              id: String(eventCounterRef.current),
              type: msg.type,
              event: msg.event,
              message: msg.message ?? "",
              data: msg.data ?? {},
              timestamp: msg.timestamp ?? new Date().toISOString(),
            };
            setWsEvents((prev) => [...prev, evt]);
            setLatestActivity(evt.message || "AI 助手处理中…");

            if (msg.event === "file_generated") {
              const content = String(msg.data?.content ?? "").trim();
              if (content) {
                partialLoadedRef.current = true;
                setMessages((prev) => upsertPartialResult(prev, content));
              }
              setFileRefreshKey((k) => k + 1);
            }

            if (msg.event === "task_result") {
              const raw = msg.data?.result ?? msg.message ?? "";
              const result = String(raw).trim() || "任务已完成，生成的文件可在右侧文件面板下载。";
              setMessages((prev) => {
                const withoutPartial = prev.filter((m) => m.id !== PARTIAL_RESULT_ID);
                return [
                  ...withoutPartial,
                  {
                    id: `ai-${Date.now()}`,
                    role: "assistant",
                    content: result,
                    timestamp: new Date(),
                  },
                ];
              });
              setIsProcessing(false);
              setIsPaused(false);
              setIsStopping(false);
              setIsPausing(false);
              setFileRefreshKey((k) => k + 1);
            }

            if (msg.event === "task_cancelled") {
              setMessages((prev) => [
                ...prev,
                {
                  id: `cancel-${Date.now()}`,
                  role: "assistant",
                  content: "**任务已停止**",
                  timestamp: new Date(),
                },
              ]);
              setIsProcessing(false);
              setIsPaused(false);
              setIsStopping(false);
              setIsPausing(false);
            }

            if (msg.event === "task_paused") {
              setIsPaused(true);
              setIsPausing(false);
            }

            if (msg.event === "task_resumed") {
              setIsPaused(false);
              setIsPausing(false);
            }

            if (msg.event === "session_created") {
              const dir = extractOutputPath(msg as MonitorEvent);
              if (dir) setOutputPath(dir);
            }
          }
        } catch {
          // non-JSON message
        }
      };
    });
  }, []);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const handleStopTask = useCallback(async () => {
    if (!isProcessing) return;

    setIsStopping(true);

    try {
      if (threadId) {
        await stopTask(threadId);
      } else {
        await stopAllTasks();
      }
    } catch {
      // 后端无响应时仍解除前端卡住状态
    }

    setIsProcessing(false);
    setIsPaused(false);
    setIsStopping(false);
    setIsPausing(false);

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.content.includes("任务已停止")) {
        return prev;
      }
      return [
        ...prev,
        {
          id: `cancel-local-${Date.now()}`,
          role: "assistant",
          content: "**任务已停止**",
          timestamp: new Date(),
        },
      ];
    });
  }, [isProcessing, threadId]);

  const handlePauseTask = useCallback(async () => {
    if (!isProcessing || isPaused || !threadId) return;

    setIsPausing(true);
    try {
      await pauseTask(threadId);
      setIsPaused(true);
    } catch {
      // ignore
    } finally {
      setIsPausing(false);
    }
  }, [isProcessing, isPaused, threadId]);

  const handleResumeTask = useCallback(async () => {
    if (!isProcessing || !isPaused || !threadId) return;

    setIsPausing(true);
    try {
      await resumeTask(threadId);
      setIsPaused(false);
    } catch {
      // ignore
    } finally {
      setIsPausing(false);
    }
  }, [isProcessing, isPaused, threadId]);

  const sendQuery = async () => {
    const query = inputValue.trim();
    if (!query || isProcessing) return;

    setInputValue("");
    setOutputPath(null);
    setIsPaused(false);
    setWsEvents([]);
    setLatestActivity("正在启动任务…");
    queryStartedAtRef.current = Date.now() - 2000;
    partialLoadedRef.current = false;
    chatAutoScrollRef.current = true;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: query,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      const tid = crypto.randomUUID();
      activeThreadIdRef.current = tid;
      setThreadId(tid);
      await connectWebSocket(tid);
      await startTask(query, tid);
    } catch {
      setIsProcessing(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "**连接失败**：无法访问后端服务，请确认后端已在 `http://127.0.0.1:8000` 启动。",
          timestamp: new Date(),
        },
      ]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuery();
    }
  };

  const handleNewSession = () => {
    wsRef.current?.close();
    activeThreadIdRef.current = null;
    queryStartedAtRef.current = 0;
    setThreadId(null);
    setWsConnected(false);
    setWsEvents([]);
    setMessages([]);
    setOutputPath(null);
    setIsProcessing(false);
    setIsPaused(false);
    setIsStopping(false);
    setIsPausing(false);
    eventCounterRef.current = 0;
    partialLoadedRef.current = false;
    chatAutoScrollRef.current = true;
    setLatestActivity("AI 助手处理中…");
  };

  return (
    <div
      className="size-full flex flex-col overflow-hidden"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between px-5 py-0 border-b border-border bg-card h-12">
        <div className="flex items-center gap-3">
          {/* logo mark */}
          <div className="w-7 h-7 rounded bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Activity size={14} className="text-primary" />
          </div>
          <div>
            <span className="text-sm font-semibold text-foreground">深度检索平台</span>
            <span className="text-[10px] text-muted-foreground ml-2 font-mono">
              DeepAgents · 沃华医药
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* status badge */}
          {isProcessing && (
            <div className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 text-[11px] rounded px-2.5 py-1 border ${
                  isPaused
                    ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
                    : "text-accent bg-accent/10 border-accent/20"
                }`}
              >
                {isPaused ? (
                  <Pause size={11} />
                ) : (
                  <Loader2 size={11} className="animate-spin" />
                )}
                {isPaused ? "已暂停" : "执行中…"}
              </div>
            </div>
          )}

          {/* sub-agents indicator */}
          <div className="hidden lg:flex items-center gap-2 border border-border rounded px-3 py-1">
            <Globe size={11} className="text-muted-foreground" />
            <Database size={11} className="text-muted-foreground" />
            <BookOpen size={11} className="text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground ml-1">3 助手就绪</span>
          </div>

          <button
            onClick={handleNewSession}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground border border-border rounded px-2.5 py-1.5 transition-colors"
          >
            <Plus size={11} />
            新会话
          </button>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 grid min-h-0 overflow-hidden" style={{ gridTemplateColumns: "260px 1fr 260px" }}>
        {/* Left: Progress Timeline */}
        <ProgressSidebar
          events={wsEvents}
          wsConnected={wsConnected}
          threadId={threadId}
        />

        {/* Center: Chat Area */}
        <main className="flex flex-col min-h-0 overflow-hidden bg-background">
          {/* Messages */}
          <div
            ref={messagesScrollRef}
            onScroll={handleMessagesScroll}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-5 space-y-5"
          >
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[50vh] gap-5 pb-16">
                <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Activity size={24} className="text-primary" />
                </div>
                <div className="text-center space-y-1">
                  <h2 className="text-base font-semibold text-foreground">深度检索平台</h2>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    输入自然语言问题，系统将协调多个 AI 助手完成任务
                  </p>
                </div>
                {/* Capability tags */}
                <div className="flex flex-wrap justify-center gap-2 max-w-sm">
                  {[
                    { icon: <Database size={11} />, label: "数据问答" },
                    { icon: <Globe size={11} />, label: "网络搜索" },
                    { icon: <BookOpen size={11} />, label: "知识库检索" },
                    { icon: <FileText size={11} />, label: "报告生成" },
                  ].map((cap) => (
                    <div
                      key={cap.label}
                      className="flex items-center gap-1.5 text-[11px] text-muted-foreground border border-border rounded-full px-3 py-1"
                    >
                      {cap.icon}
                      {cap.label}
                    </div>
                  ))}
                </div>

                {/* Example queries */}
                <div className="grid grid-cols-1 gap-2 w-full max-w-md">
                  {[
                    "查询药品销售排名前10的品种及销售明细",
                    "生成一份本季度药品销售数据分析报告",
                    "搜索最近的医药行业动态并进行摘要",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => setInputValue(q)}
                      className="text-left text-xs text-muted-foreground bg-card hover:bg-secondary border border-border rounded-lg px-4 py-2.5 transition-colors group flex items-center gap-2"
                    >
                      <ChevronRight
                        size={12}
                        className="text-primary/50 group-hover:text-primary transition-colors shrink-0"
                      />
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}

            {/* Processing indicator */}
            {isProcessing && (
              <div className="flex gap-3">
                <div className="shrink-0 w-7 h-7 rounded bg-secondary border border-border flex items-center justify-center text-[10px] font-mono text-accent">
                  AI
                </div>
                <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
                  {isPaused ? (
                    <Pause size={14} className="text-amber-400" />
                  ) : (
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                          style={{ animationDelay: `${i * 150}ms` }}
                        />
                      ))}
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {isPaused
                      ? "任务已暂停，点击恢复继续执行"
                      : latestActivity || "AI 助手处理中…"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="shrink-0 border-t border-border bg-card px-4 py-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isProcessing}
                  placeholder="输入问题，按 Enter 发送（Shift+Enter 换行）…"
                  rows={1}
                  className="w-full resize-none bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all disabled:opacity-50 max-h-32 overflow-y-auto"
                  style={{ lineHeight: "1.5" }}
                  onInput={(e) => {
                    const t = e.target as HTMLTextAreaElement;
                    t.style.height = "auto";
                    t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
                  }}
                />
              </div>
              <button
                onClick={sendQuery}
                disabled={isProcessing || !inputValue.trim()}
                className="shrink-0 w-10 h-10 flex items-center justify-center bg-primary text-primary-foreground rounded-lg disabled:opacity-40 hover:bg-primary/90 transition-colors"
              >
                {isProcessing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
              </button>
              {isProcessing && (
                <TaskControlButtons
                  isPaused={isPaused}
                  onPause={handlePauseTask}
                  onResume={handleResumeTask}
                  onStop={handleStopTask}
                  pausing={isPausing}
                  stopping={isStopping}
                />
              )}
            </div>
            <div className="flex items-center gap-3 mt-2 px-1">
              <span className="text-[10px] text-muted-foreground/50">
                POST /api/task → WebSocket /ws/&#123;thread_id&#125;
              </span>
            </div>
          </div>
        </main>

        {/* Right: File Panel */}
        <FilePanel threadId={threadId} outputPath={outputPath} refreshKey={fileRefreshKey} />
      </div>

    </div>
  );
}
