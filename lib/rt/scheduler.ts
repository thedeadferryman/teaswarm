import * as uuid from 'uuid';
import { isNil, isString, isFunction, isNumber } from '@lib/util';

export interface TaskSchedulerOptions {
	heartbeat: number;
}

type OCEventPullResult<T extends OC.EventType> = LuaMultiReturn<[T, ...OC.EventMap[T]]>;
type CustomEventPullResult = LuaMultiReturn<[string, ...unknown[]]>;
type EventPullResult<T extends string> = T extends OC.EventType ? OCEventPullResult<T> : CustomEventPullResult;

export interface EventSource {
	pull: (timeout?: number) => EventPullResult<string> | [undefined];
}

export interface Clock {
	time: () => number;
}

export type EventSelector = (eventType: string, ...data: unknown[]) => boolean;

export interface ITaskContext {
	pullEventFiltered: (selector: EventSelector, timeout?: number) => EventPullResult<string>;
	pullEvent: <T extends string>(type: T, timeout?: number) => EventPullResult<T>;
}

type TaskState = 'new' | 'running' | 'ill' | 'finished';

interface Task {
	handle: LuaThread;
	selector: EventSelector;
	deadline?: number;
	state: TaskState;
}

const TaskMessageTypes = ['pullFiltered'] as const;
type TaskMessageType = typeof TaskMessageTypes[number];

const isTaskMessageType = (value: unknown): value is TaskMessageType => (
	isString(value) && TaskMessageTypes.includes(value as TaskMessageType)
);

export const TIMEOUT_EVENT = '##timeout';

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

interface SchedulerController {
	shutdown: () => void;
}

type EventHook<T extends string> = (
	controller: SchedulerController,
	...args: EventPullResult<T>
) => unknown;

type AnyEventHook = (controller: SchedulerController, ...args: unknown[]) => unknown;

class TaskScheduler {
	private tasks: Record<string, Task> = {};

	private hooks: Record<string, AnyEventHook> = {};
	private hookBindings: Record<string, string[]> = {};

	private controller: SchedulerController = {
		shutdown: () => undefined,
	};

	constructor(
		private eventSource: EventSource,
		private clock: Clock,
		private options: TaskSchedulerOptions,
	) {
	}

	dispatch(body: (context: ITaskContext) => unknown) {
		const coro = coroutine.create(body);
		const uid = uuid.next();

		this.tasks[uid] = {
			handle: coro,
			selector: () => true,
			state: 'new',
		};
	}

	installHook<T extends string>(type: T, hook: EventHook<T>) {
		const uid = uuid.next();
		this.hooks[uid] = hook as AnyEventHook;

		this.hookBindings[type] ||= [];
		this.hookBindings[type].push(uid);

		return uid;
	}

	dropHook(uid: string) {
		delete this.hooks[uid];
	}

	run() {
		let terminate = false;

		this.controller = {
			shutdown: () => {
				terminate = true;
			},
		};

		while (true) {
			if (terminate) break;

			this.cleanupTasks();
			this.cleanupHooks();
			this.processIteration();
		}
	}

	private cleanupTasks() {
		const deadStates: TaskState[] = ['ill', 'finished'];

		this.forEachTask((uid, task) => {
			if (
				deadStates.includes(task.state)
				|| coroutine.status(task.handle) === 'dead'
			) {
				delete this.tasks[uid];
			}
		});
	}

	private cleanupHooks() {
		for (const type of Object.keys(this.hookBindings)) {
			const currentBindings = this.hookBindings[type];

			if (isNil(currentBindings)) continue;

			this.hookBindings[type] = currentBindings.filter(binding => !isNil(this.hooks[binding]));
		}
	}

	private processIteration() {
		const [eventType, ...eventData] = this.eventSource.pull(this.options.heartbeat);

		if (!isNil(eventType)) {
			this.processHooks(eventType, ...eventData);
		}

		this.forEachTask((uid, task) => {
			if (task.state === 'new') {
				return this.resumeAndUpdate(uid, task, [new TaskContext()]);
			}

			if (
				!isNil(eventType)
				&& task.selector(eventType, ...(eventData as OC.EventMap[OC.EventType]))
			) {
				return this.resumeAndUpdate(uid, task, [eventType, ...eventData]);
			}

			if (!isNil(task.deadline) && this.clock.time() > task.deadline) {
				return this.resumeAndUpdate(uid, task, [TIMEOUT_EVENT]);
			}
		});
	}

	private processHooks(
		type: string,
		...args: unknown[]
	) {
		const bindings = this.hookBindings[type] ?? [];

		for (const binding of bindings) {
			const hook = this.hooks[binding];

			hook?.(this.controller, type, ...args);
		}
	}

	private resumeAndUpdate(uid: string, task: Task, resumeArgs: unknown[]) {
		const newTaskState = this.doResumeTask(uid, task, resumeArgs);

		this.tasks[uid] = {
			...task,
			...newTaskState,
		};
	}

	private doResumeTask(
		uid: string,
		task: Task,
		resumeArgs: unknown[],
	): Omit<Task, 'handle'> {
		const [success, ...data] = coroutine.resume(task.handle, ...resumeArgs);

		if (coroutine.status(task.handle) === 'dead') {
			return {
				selector: () => false,
				state: 'finished',
			};
		}

		if (!success) {
			return this.handleTaskError(uid, data[0]);
		}

		return this.handleTaskMessage(data) ?? this.handleTaskError(uid, 'invalid task message');
	}

	private handleTaskMessage(data: unknown[]) {
		if (data.length < 2) return;

		const type = data.shift();

		if (!isTaskMessageType(type)) return;

		switch (type) {
			case 'pullFiltered':
				return this.handleTaskPull(data);
			default:
				return;
		}
	}

	private handleTaskPull(
		data: unknown[],
	) {
		const [filter, timeout] = data;

		const selector = isFunction(filter) ? (filter as EventSelector) : () => false;
		const deadline = isNumber(timeout) ? (timeout + this.clock.time()) : undefined;

		return {
			selector,
			deadline,
			state: 'running',
		} satisfies Omit<Task, 'handle'>;
	}

	private handleTaskError(uid: string, message: string) {
		print(`task ${uid} failed: ${message}`);

		return {
			selector: () => false,
			state: 'ill',
		} satisfies Omit<Task, 'handle'>;
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