import type {
  ScheduledTask,
  Scheduler,
  SchedulerTimerHandle,
} from "../../../src/features/terminal/platform/scheduler";

type PendingTask = {
  id: number;
  dueAtMs: number;
  task: ScheduledTask;
  intervalMs: number | null;
};

export class FakeScheduler implements Scheduler {
  private nowMs = 0;
  private nextTaskId = 1;
  private tasks = new Map<number, PendingTask>();

  now(): number {
    return this.nowMs;
  }

  setTimeout(task: ScheduledTask, delayMs: number): SchedulerTimerHandle {
    const taskId = this.nextTaskId++;
    this.tasks.set(taskId, {
      id: taskId,
      dueAtMs: this.nowMs + Math.max(0, delayMs),
      task,
      intervalMs: null,
    });
    return taskId;
  }

  clearTimeout(timerId: SchedulerTimerHandle): void {
    this.tasks.delete(Number(timerId));
  }

  setInterval(task: ScheduledTask, intervalMs: number): SchedulerTimerHandle {
    const taskId = this.nextTaskId++;
    this.tasks.set(taskId, {
      id: taskId,
      dueAtMs: this.nowMs + Math.max(0, intervalMs),
      task,
      intervalMs: Math.max(1, intervalMs),
    });
    return taskId;
  }

  clearInterval(timerId: SchedulerTimerHandle): void {
    this.tasks.delete(Number(timerId));
  }

  advanceBy(deltaMs: number): void {
    const targetTime = this.nowMs + Math.max(0, deltaMs);

    while (true) {
      let nextTask: PendingTask | null = null;
      for (const task of this.tasks.values()) {
        if (task.dueAtMs > targetTime) {
          continue;
        }
        if (
          !nextTask ||
          task.dueAtMs < nextTask.dueAtMs ||
          (task.dueAtMs === nextTask.dueAtMs && task.id < nextTask.id)
        ) {
          nextTask = task;
        }
      }

      if (!nextTask) {
        break;
      }

      this.nowMs = nextTask.dueAtMs;
      if (nextTask.intervalMs === null) {
        this.tasks.delete(nextTask.id);
      } else {
        nextTask.dueAtMs += nextTask.intervalMs;
        this.tasks.set(nextTask.id, nextTask);
      }
      nextTask.task();
    }

    this.nowMs = targetTime;
  }
}
