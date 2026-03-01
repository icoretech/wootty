import type { NoticeDetails, NoticePublisher } from "./notice-contract";

export function createNoticePublisher(
  publishMessage: (message: string) => void,
  formatNotice: (details: NoticeDetails) => string,
): NoticePublisher {
  return (details) => {
    publishMessage(formatNotice(details));
  };
}
