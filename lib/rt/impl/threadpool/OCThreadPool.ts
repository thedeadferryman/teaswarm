import type ThreadPool from '@lib/rt/threadpool';
import * as thread from 'thread';

export interface OCThreadPoolOptions {
	poolSize: number;
}

export class OCThreadPool implements ThreadPool {
	private handles: OpenOS.Thread[];

	static default() {
		return new OCThreadPool({
			poolSize: 12,
		});
	}

	constructor(private options: OCThreadPoolOptions) {
		this.handles = [];
	}

	dispatch(...args: Parameters<typeof thread.create>): boolean {
		if (this.handles.length >= this.options.poolSize) {
			return false;
		}

		this.handles.push(thread.create(...args));

		return true;
	}

	refresh() {
		this.handles = this.handles.filter(handle => (
			handle.status() !== 'dead'
		));
	}

	terminate() {
		for (const handle of this.handles) {
			handle.kill();
		}

		return this.join();
	}

	join() {
		return thread.waitForAll(this.handles);
	}
}
