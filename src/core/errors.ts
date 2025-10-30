export enum ErrorCode {
  CliNotFound = 'CLI_NOT_FOUND',
  CommandFailed = 'COMMAND_FAILED',
  PermissionDenied = 'PERMISSION_DENIED',
  NetworkError = 'NETWORK_ERROR',
  Unknown = 'UNKNOWN'
}

export class AppleContainerError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode = ErrorCode.Unknown,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AppleContainerError';
  }
}

export const toAppleContainerError = (error: unknown): AppleContainerError => {
  if (error instanceof AppleContainerError) {
    return error;
  }

  if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
    return new AppleContainerError('container CLI not found on PATH', ErrorCode.CliNotFound, error);
  }

  return new AppleContainerError((error as Error)?.message ?? 'Unknown error', ErrorCode.Unknown, error);
};

