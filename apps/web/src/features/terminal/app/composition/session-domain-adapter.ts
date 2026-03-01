import type { TerminalDomainEnvironment } from "../../environment/terminal-environment-contract";
import type { NoticePublisher } from "../../notifications/notice-contract";
import type { TerminalPlatformContext } from "./terminal-platform-composition";
import { useTerminalSessionDomain } from "./terminal-session-domain";

export type SessionAttachmentController = {
  uiState: ReturnType<typeof useTerminalSessionDomain>["uiState"];
  sessionState: ReturnType<typeof useTerminalSessionDomain>["sessionState"];
  sessionActions: ReturnType<typeof useTerminalSessionDomain>["sessionActions"];
  publishNotice: NoticePublisher;
  wsUrl: string | null;
};

export function useSessionAttachmentController({
  environment,
  platform,
}: {
  environment: TerminalDomainEnvironment;
  platform: TerminalPlatformContext;
}): SessionAttachmentController {
  const domain = useTerminalSessionDomain({
    environment,
    platform,
  });

  return {
    uiState: domain.uiState,
    sessionState: domain.sessionState,
    sessionActions: domain.sessionActions,
    publishNotice: domain.publishNotice,
    wsUrl: domain.wsUrl,
  };
}
