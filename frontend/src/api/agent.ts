import { request, getWsBase } from '@/lib/request';

export interface TaskRequest {
  query: string;
  thread_id?: string;
}

export interface TaskResponse {
  status: 'started';
  thread_id: string;
}

export interface StopTaskResponse {
  status: 'stopped' | 'not_found';
  thread_id: string;
  running_tasks?: string[];
}

export interface StopAllTasksResponse {
  status: 'stopped' | 'not_found';
  stopped_tasks: string[];
  running_tasks?: string[];
}

export interface PauseTaskResponse {
  status: 'paused' | 'not_found';
  thread_id: string;
  running_tasks?: string[];
}

export interface ResumeTaskResponse {
  status: 'resumed' | 'not_found';
  thread_id: string;
  running_tasks?: string[];
}

export interface UploadResponse {
  status: 'uploaded';
  files: string[];
}

export interface FileItem {
  name: string;
  type: string;
  path: string;
  size: number;
  mtime: number;
}

export interface FilesResponse {
  files?: FileItem[];
  error?: string;
}

export interface MonitorEvent {
  type: 'monitor_event';
  event: 'tool_start' | 'tool_end' | 'assistant_call' | 'session_created' | 'file_generated' | 'task_result' | 'task_cancelled' | 'task_paused' | 'task_resumed' | 'error';
  message: string;
  data: {
    tool_name?: string;
    args?: Record<string, unknown>;
    assistant_name?: string;
    path?: string;
    filename?: string;
    content?: string;
    preview?: string;
    result?: string;
    [key: string]: unknown;
  };
  timestamp: string;
}

export function startTask(query: string, threadId?: string) {
  return request<TaskResponse>('/api/task', {
    method: 'POST',
    body: { query, ...(threadId ? { thread_id: threadId } : {}) },
  });
}

export function stopTask(threadId: string) {
  return request<StopTaskResponse>('/api/task/stop', {
    method: 'POST',
    body: { thread_id: threadId },
  });
}

export function stopAllTasks() {
  return request<StopAllTasksResponse>('/api/task/stop-all', {
    method: 'POST',
    body: {},
  });
}

export function pauseTask(threadId: string) {
  return request<PauseTaskResponse>('/api/task/pause', {
    method: 'POST',
    body: { thread_id: threadId },
  });
}

export function resumeTask(threadId: string) {
  return request<ResumeTaskResponse>('/api/task/resume', {
    method: 'POST',
    body: { thread_id: threadId },
  });
}

export function uploadSessionFiles(files: File[], threadId: string) {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  formData.append('thread_id', threadId);
  return request<UploadResponse>('/api/upload', {
    method: 'POST',
    body: formData,
  });
}

export function listFiles(outputPath: string) {
  return request<FilesResponse>('/api/files', {
    params: { path: outputPath },
  });
}

export function getDownloadUrl(filePath: string): string {
  const base = import.meta.env.VITE_API_BASE ?? '';
  return `${base}/api/download?path=${encodeURIComponent(filePath)}`;
}

export function getWsUrl(threadId: string): string {
  return `${getWsBase()}/ws/${threadId}`;
}

export function extractOutputPath(event: MonitorEvent): string | null {
  if (event.event === 'session_created' && event.data?.path) {
    return String(event.data.path);
  }
  return null;
}
