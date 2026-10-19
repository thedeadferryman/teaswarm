import type Transport from '@lib/net/transport';
import Receptionist from '@lib/net/tcp/receptionist';
import * as computer from 'computer';
import type { Peer } from '@lib/net/types';

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
			this.options.localPort,
			this.options.heartbeat,
		);

		const deadline = computer.uptime() + this.options.timeout;

		let result: string | undefined;

		server.listen(
			(sender, data, controller) => {
				if (matcher(sender, data)) {
					result = data;
					controller.shutdown();
				}
			},
			controller => {
				if (computer.uptime() >= deadline) {
					result = undefined;
					controller.shutdown();
				}
			},
		);

		return result;
	}
}

export default TransmissionScoop;