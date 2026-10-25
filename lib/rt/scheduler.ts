import * as uuid from 'uuid';
import { isNil, isFunction, isNumber, isString } from '@lib/util';
import { TaskContext, contexts } from '@lib/rt/impl/scheduler/context';
import { type EventPullResult, type TaskState, isTaskMessageType } from '@lib/rt/impl/scheduler/types';

export interface TaskSchedulerOptions {
	heartbeat: number;
	capacity: number;
}

export const SchedulerEvents = {
	timeout: '##timeout',
	taskStateChange: '##taskStateChange',
} as const;


export interface EventSource {
	pull: (timeout?: number) => EventPullResult<string> | [undefined];
}

export interface Clock {
	time: () => number;
}

export interface Logger {
	error: (...messages: unknown[]) => void;
}

export type EventSelector = (eventType: string, ...data: unknown[]) => boolean;

interface Task {
	handle: LuaThread;
	selector: EventSelector;
	deadline?: number;
	state: TaskState;
}

setmetatable(contexts, { __mode: 'k' });

interface SchedulerController {
	shutdown: () => void;
}

type EventHook<T extends string> = (
	controller: SchedulerController,
	...args: EventPullResult<T>
) => unknown;

type AnyEventHook = (controller: SchedulerController, ...args: unknown[]) => unknown;

const errorSafeSelector = (
	func: EventSelector,
	onError?: (err: unknown) => void,
): EventSelector => {
	return (...args) => {
		try {
			return func(...args);
		} catch (e) {
			onError?.(e);
			return false;
		}
	};
};

const DEAD_TASK_STATES = ['ill', 'finished'];

class TaskScheduler {
	private tasks: Record<string, Task> = {};

	private hooks: Record<string, AnyEventHook> = {};
	private hookBindings: Record<string, string[]> = {};

	private taskObservers: Record<string, string[]> = {};

	private controller: SchedulerController = {
		shutdown: () => undefined,
	};

	constructor(
		private eventSource: EventSource,
		private clock: Clock,
		private logger: Logger,
		private options: TaskSchedulerOptions,
	) {
	}

	dispatch(body: (context: TaskContext) => unknown) {
		const uids = Object.keys(this.tasks);

		if (uids.length >= this.options.capacity) return undefined;

		const coro = coroutine.create(body);
		const uid = uuid.next();

		this.tasks[uid] = {
			handle: coro,
			selector: () => true,
			state: 'new',
		};

		contexts.set(coro, new TaskContext(this));

		return uid;
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

			this.processObservers();
			this.cleanupTasks();
			this.cleanupHooks();
			this.processIteration();
		}
	}

	isRunning(uid: string) {
		const task = this.tasks[uid];

		if (isNil(task)) return false;

		if (DEAD_TASK_STATES.includes(task.state)) return false;

		return coroutine.status(task.handle) !== 'dead';
	}

	discard(uid: string) {
		const task = this.tasks[uid];

		if (isNil(task)) return;

		this.tasks[uid] = { ...task, state: 'finished' };
	}

	private processObservers() {
		const observedTasks = Object.keys(this.taskObservers);

		for (const uid of observedTasks) {
			const task = this.tasks[uid];

			if (isNil(task)) {
				delete this.taskObservers[uid];
				continue;
			}

			this.reportTaskStateChange(task.state, this.taskObservers[uid] ?? []);
			delete this.taskObservers[uid];
		}
	}

	private reportTaskStateChange(
		state: TaskState,
		observers: string[],
	) {
		for (const uid of observers) {
			const observer = this.tasks[uid];

			if (
				isNil(observer)
				|| observer.state !== 'running'
				|| coroutine.status(observer.handle) === 'dead'
			) continue;

			this.resumeAndUpdate(uid, observer, [state]);
		}
	}

	private cleanupTasks() {
		this.forEachTask((uid, task) => {
			if (
				DEAD_TASK_STATES.includes(task.state)
				|| coroutine.status(task.handle) === 'dead'
			) {
				delete this.tasks[uid];
				delete this.taskObservers[uid];
				contexts.delete(task.handle);
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
		this.forEachTask((uid, task) => {
			if (task.state === 'new') {
				return this.resumeAndUpdate(uid, task, []);
			}
		});

		const [eventType, ...eventData] = this.eventSource.pull(this.calculatePullDelay());

		if (!isNil(eventType)) {
			this.processHooks(eventType, ...eventData);
		}

		this.forEachTask((uid, task) => {
			if (
				coroutine.status(task.handle) === 'dead'
				|| task.state !== 'running'
			) return;

			if (
				!isNil(eventType)
				&& task.selector(eventType, ...(eventData as OC.EventMap[OC.EventType]))
			) {
				return this.resumeAndUpdate(uid, task, [eventType, ...eventData]);
			}

			if (!isNil(task.deadline) && this.clock.time() >= task.deadline) {
				return this.resumeAndUpdate(uid, task, [SchedulerEvents.timeout]);
			}
		});
	}

	private calculatePullDelay() {
		const now = this.clock.time();

		const delays = Object.values(this.tasks)
			.map(task => task.deadline)
			.filter(dl => !isNil(dl))
			.map(dl => dl - now);

		if (delays.length <= 0) return this.options.heartbeat;

		const nextDeadlineDelay = Math.max(
			0,
			Math.min(...delays),
		);

		return Math.min(this.options.heartbeat, nextDeadlineDelay);
	}

	private processHooks(
		type: string,
		...args: unknown[]
	) {
		const bindings = [...this.hookBindings[type] ?? []];

		for (const binding of bindings) {
			const hook = this.hooks[binding];

			try {
				hook?.(this.controller, type, ...args);
			} catch (e) {
				this.logger.error('Hook execution failed', e);
			}
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

		if (!success) {
			return this.handleTaskError(uid, data[0]);
		}

		if (coroutine.status(task.handle) === 'dead') {
			return this.handleTaskFinished();
		}

		return this.handleTaskMessage(uid, data) ?? this.handleTaskError(uid, 'invalid task message');
	}

	private handleTaskFinished(): Omit<Task, 'handle'> {
		return {
			selector: () => false,
			state: 'finished',
			deadline: undefined,
		};
	}

	private handleTaskError(uid: string, message: string) {
		this.logger.error(`task ${uid} failed: ${message}`);

		return {
			selector: () => false,
			state: 'ill',
			deadline: undefined,
		} satisfies Omit<Task, 'handle'>;
	}

	private handleTaskMessage(
		uid: string,
		data: unknown[],
	) {
		if (data.length < 2) return;

		const type = data.shift();

		if (!isTaskMessageType(type)) return;

		switch (type) {
			case 'pullFiltered':
				return this.handleTaskPull(data);
			case 'waitFor':
				return this.handleTaskWaitFor(uid, data);
			default:
				return;
		}
	}

	private handleTaskPull(
		data: unknown[],
	) {
		const [filter, timeout] = data;

		const selector = errorSafeSelector(
			isFunction(filter) ? (filter as EventSelector) : () => false,
			err => this.logger.error('event selector threw', err),
		);
		const deadline = isNumber(timeout) ? (timeout + this.clock.time()) : undefined;

		return {
			selector,
			deadline,
			state: 'running',
		} satisfies Omit<Task, 'handle'>;
	}

	private handleTaskWaitFor(
		uid: string,
		data: unknown[],
	): Omit<Task, 'handle'> {
		const [observedUid, timeout] = data;

		if (!isString(observedUid)) {
			return {
				state: 'ill',
				selector: () => false,
			};
		}

		const deadline = isNumber(timeout) ? (timeout + this.clock.time()) : undefined;

		this.taskObservers[observedUid] ||= [];
		this.taskObservers[observedUid].push(uid);

		return {
			selector: () => false,
			deadline,
			state: 'running',
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