export type ScheduledTask = () => void;
export type SchedulerTimerHandle = ReturnType<typeof globalThis.setTimeout>;

export type Scheduler = {
  now: () => number;
  setTimeout: (task: ScheduledTask, delayMs: number) => SchedulerTimerHandle;
  clearTimeout: (timerId: SchedulerTimerHandle) => void;
  setInterval: (
    task: ScheduledTask,
    intervalMs: number,
  ) => SchedulerTimerHandle;
  clearInterval: (timerId: SchedulerTimerHandle) => void;
};

export const browserScheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (task, delayMs) => globalThis.setTimeout(task, delayMs),
  clearTimeout: (timerId) => {
    globalThis.clearTimeout(timerId);
  },
  setInterval: (task, intervalMs) => globalThis.setInterval(task, intervalMs),
  clearInterval: (timerId) => {
    globalThis.clearInterval(timerId);
  },
};
