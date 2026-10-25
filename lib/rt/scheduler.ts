import * as uuid from 'uuid';
import { isNil, isString, isFunction, isNumber } from '@lib/util';

export interface TaskSchedulerOptions {
	heartbeat: number;
}

type OCEventPullResult<T extends OC.EventType> = LuaMultiReturn<[T, ...OC.EventMap[T]]>;
type CustomEventPullResult = LuaMultiReturn<[string, ...unknown[]]>;
type EventPullResult<T extends string> = T extends OC.EventType ? OCEventPullResult<T> : CustomEventPullResult;

export interface EventSource {
	pull: (timeout?: number) => EventPullResult<string>;
}

export interface Clock {
	time: () => number;
}

export type EventSelector = (eventType: string, ...data: unknown[]) => boolean;

export interface ITaskContext {
	pullEventFiltered: (selector: EventSelector, timeout?: number) => EventPullResult<string>;
	pullEvent: <T extends string>(type: T, timeout?: number) => EventPullResult<T>;
}

interface Task {
	handle: LuaThread;
	selector: EventSelector;
	deadline?: number;
	ill?: boolean;
	needsInit?: boolean;
}

const TaskMessageTypes = ['pullFiltered'] as const;
type TaskMessageType = typeof TaskMessageTypes[number];

const isTaskMessageType = (value: unknown): value is TaskMessageType => (
	isString(value) && TaskMessageTypes.includes(value as TaskMessageType)
);

export const TIMEOUT_EVENT = 'timeout';

export class TaskContext implements ITaskContext {
	constructor() {
	}

	pullEventFiltered(selector: EventSelector, timeout?: number) {
		const [type, ...data] = coroutine.yield(selector, timeout);

		if (isString(type)) return $multi(type, ...data);

		throw 'invalid response from the scheduler';
	}

	pullEvent<T extends string>(type: T, timeout?: number) {
		return this.pullEventFiltered(
			(eventType) => eventType === type,
			timeout,
		) as EventPullResult<T>;
	}
}

class TaskScheduler {
	private tasks: Record<string, Task> = {};

	constructor(
		private eventSource: EventSource,
		private clock: Clock,
		private options: TaskSchedulerOptions,
	) {
	}

	dispatch(body: (controller: TaskContext) => unknown) {
		const coro = coroutine.create(body);
		const uid = uuid.next();

		this.tasks[uid] = {
			handle: coro,
			selector: () => true,
		};
	}

	run() {
		let terminate = false;

		while (true) {
			if (terminate) break;

			this.initTasks();
			this.cleanupTasks();
			this.processIteration();
		}
	}

	private initTasks() {
		this.forEachTask((_, task) => {
			if (task.needsInit) {
				coroutine.resume(task.handle, new TaskContext());
			}
		});
	}

	private cleanupTasks() {
		this.forEachTask((uid, task) => {
			if (task.ill || coroutine.status(task.handle) === 'dead') {
				delete this.tasks[uid];
			}
		});
	}

	private processIteration() {
		const [eventType, ...eventData] = this.eventSource.pull(this.options.heartbeat);

		this.forEachTask((uid, task) => {
			if (task.selector(eventType, ...(eventData as OC.EventMap[OC.EventType]))) {
				this.resumeTask(uid, task, [eventType, ...eventData]);
			}

			if (!isNil(task.deadline) && this.clock.time() > task.deadline) {
				this.resumeTask(uid, task, [TIMEOUT_EVENT]);
			}
		});
	}

	private resumeTask(
		uid: string,
		task: Task,
		resumeArgs: unknown[],
	): Omit<Task, 'handle'> {
		const [success, ...data] = coroutine.resume(task.handle, ...resumeArgs);

		if (!success) {
			return this.handleTaskError(uid, data[0]);
		}

		return this.handleTaskMessage(uid, data) ?? this.handleTaskError(uid, 'invalid task message');
	}

	private handleTaskMessage(uid: string, data: unknown[]) {
		if (data.length < 2) return;

		const type = data.shift();

		if (!isTaskMessageType(type)) return;

		switch (type) {
			case 'pullFiltered':
				return this.handleTaskPull(uid, data);
			default:
				return;
		}
	}

	private handleTaskPull(
		uid: string,
		data: unknown[],
	) {
		const [filter, timeout] = data;

		const selector = isFunction(filter) ? (filter as EventSelector) : () => false;
		const deadline = isNumber(timeout) ? (timeout + this.clock.time()) : undefined;

		return { selector, deadline };
	}

	private handleTaskError(uid: string, message: string) {
		print(`task ${uid} failed: ${message}`);

		return {
			selector: () => false,
			ill: true,
		};
	}

	private forEachTask(cb: (uid: string, task: Task) => void) {
		const uids = Object.keys(this.tasks);

		for (const uid of uids) {
			const task = this.tasks[uid];
			if (isNil(task)) continue;

			cb(uid, task);
		}
	}
}

export default TaskScheduler;