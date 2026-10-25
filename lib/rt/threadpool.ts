interface ThreadPool {
	dispatch: (body: Function, ...args: unknown[]) => boolean;

	refresh: () => void;

	terminate: () => void;

	join: () => void;
}

export default ThreadPool;

export { OCThreadPool } from './impl/threadpool/OCThreadPool';
export { ScheduledThreadPool } from './impl/threadpool/ScheduledThreadPool';