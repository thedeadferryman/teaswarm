import type Transport from '@lib/net/transport';
import Receptionist from '@lib/net/tcp/receptionist';
import * as computer from 'computer';
import type { Peer } from '@lib/net/types';
import ThreadPool from '@lib/std/ThreadPool';

export interface ScoopOptions {
	localPort: number;
	timeout: number;
	heartbeat: number;
}

class TransmissionScoop {
	constructor(
		private readonly transport: Transport,
		private readonly options: ScoopOptions,
	) {
	}

	receive(matcher: (sender: Peer, data: string) => boolean) {
		const server = new Receptionist(
			this.transport,
			ThreadPool.default(),
			{
				channelTimeout: this.options.timeout,
				...this.options,
			},
		);

		const deadline = computer.uptime() + this.options.timeout;

		let result: string | undefined;

		server.listen({
			onMessage: (sender, data, controller) => {
				if (matcher(sender, data)) {
					result = data;
					controller.shutdown(true);
				}
			},
			onHeartbeat: (controller) => {
				if (computer.uptime() >= deadline) {
					result = undefined;
					controller.shutdown(true);
				}
			},
		});

		return result;
	}
}

export default TransmissionScoop;