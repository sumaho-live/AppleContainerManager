export type LogSeverity = 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'success' | 'unknown';

export function inferLogSeverity(message: string, isErrorStream?: boolean): LogSeverity {
  if (isErrorStream) {
    return 'error';
  }
  const upper = message.toUpperCase();
  if (/\b(ERROR|FAILED|FAILURE|CRITICAL)\b/.test(upper)) {
    return 'error';
  }
  if (/\b(WARN|WARNING)\b/.test(upper)) {
    return 'warn';
  }
  if (/\b(SUCCESS|STARTED|RUNNING|READY|COMPLETED)\b/.test(upper)) {
    return 'success';
  }
  if (/\b(INFO|INFORMATION)\b/.test(upper)) {
    return 'info';
  }
  if (/\b(DEBUG|TRACE)\b/.test(upper)) {
    return 'debug';
  }
  return 'unknown';
}
