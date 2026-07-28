export interface BusinessErrorDescriptor {
  code: string;
  messageKey: string;
  recoverable?: boolean;
  requiresUserAction?: boolean;
  metadata?: Record<string, unknown>;
}
