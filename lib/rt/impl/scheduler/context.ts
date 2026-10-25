import { isNil, isString } from '@lib/util';
import TaskScheduler, { type EventSelector } from '@lib/rt/scheduler';
import { type EventPullResult, isDeadTaskState, isSchedulerEvent } from '@lib/rt/impl/scheduler/types';

export const contexts = new LuaMap<LuaThread, TaskContext>();

export class TaskContext {
	// noinspection JSUnusedLocalSymbols
	constructor(
		private scheduler: TaskScheduler,
	) {
	}

	static tryCurrent() {
		const [identity, isMain] = coroutine.running();

		return isMain ? undefined : contexts.get(identity);
	}

	static current() {
		const context = this.tryCurrent();

		if (isNil(context)) {
			throw 'not running in a scheduled task';
		}

		return context;
	}

	pullEventFiltered(selector: EventSelector, timeout?: number) {
		const [type, ...data] = coroutine.yield('pullFiltered', selector, timeout);

		if (isString(type)) return $multi(type, ...data);

		throw 'invalid response from the scheduler';
	}

	pullEvent<T extends string>(type: T, timeout?: number) {
		return this.pullEventFiltered(
			(eventType) => eventType === type,
			timeout,
		) as EventPullResult<T>;
	}

	waitForCompletion(uid: string, timeout?: number) {
		const [result] = coroutine.yield('waitFor', uid, timeout);

		if (isDeadTaskState(result)) {
			return [true, result] as const;
		}

		if (isSchedulerEvent(result, 'timeout')) {
			return [false, 'timeout'] as const;
		}

		return [false, 'invalid'] as const;
	}

	// dispatch(task: (context: TaskContext) => unknown) {
	// 	return this.scheduler.dispatch(task);
	// }
}