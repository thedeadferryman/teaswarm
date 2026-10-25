import type ThreadPool from '@lib/rt/threadpool';
import TaskScheduler from '@lib/rt/scheduler';
import { TaskContext } from '@lib/rt/impl/scheduler/context';
import { isNil } from '@lib/util';

export interface ScheduledThreadPoolOptions {
	joinTimeout?: number;
}

export class ScheduledThreadPool implements ThreadPool {
	private threads: string[] = [];

	constructor(
		private scheduler: TaskScheduler,
		private options: ScheduledThreadPoolOptions,
	) {
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

		for (const uid of this.threads) {
			const [success, outcome] = context.waitForCompletion(uid, this.options.joinTimeout);

			if (success) continue;

			if (outcome === 'timeout') {
				this.scheduler.discard(uid);
			}
		}
	}

	dispatch(body: Function, ...args: unknown[]) {
		const uid = this.scheduler.dispatch(() => {
			body(...args);
		});

		if (isNil(uid)) return false;

		this.threads.push(uid);

		return true;
	}
}
