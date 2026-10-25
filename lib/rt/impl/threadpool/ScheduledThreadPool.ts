import type ThreadPool from '@lib/rt/threadpool';
import TaskScheduler from '@lib/rt/scheduler';
import { TaskContext } from '@lib/rt/impl/scheduler/context';

export class ScheduledThreadPool implements ThreadPool {
	private threads: string[] = [];

	constructor(private scheduler: TaskScheduler) {
	}

	refresh() {
		this.threads = this.threads.filter(uid => this.scheduler.isRunning(uid));
	}

	terminate() {
		this.refresh();

		for (const uid of this.threads) {
			this.scheduler.discard(uid);
		}
	}

	join() {
		this.refresh();
		if (this.threads.length <= 0) return;

		const context = TaskContext.current();

		// TODO
	}

	dispatch(body: Function, ...args: unknown[]) {
		const uid = this.scheduler.dispatch(() => {
			body(...args);
		});

		this.threads.push(uid);

		return true;
	}
}
