import type Transport from '@lib/net/transport';
import * as uuid from 'uuid';
import { encodeRadpControlPacket, tryParseRadpDataPacket, parseRadpDataPacket } from '@lib/net/radp/packet';
import TransmissionScoop from '@lib/net/tcp/TransmissionScoop';
import { isNil } from '@lib/util';
import type { RadpClientOptions } from '@lib/net/radp/ClientOptions';

class RequestExecutor {
	private readonly uid: string;

	constructor(
		private readonly transport: Transport,
		private readonly request: string,
		private readonly options: RadpClientOptions,
	) {
		this.uid = uuid.next();
	}

	execute() {
		for (let i = 0; i < this.options.retryCount; i++) {
			this.transport.sendPacket(this.options.server, encodeRadpControlPacket({
				type: 'GET',
				uid: this.uid,
				body: this.request,
				sender: {
					addr: this.transport.address,
					port: this.options.localPort,
				},
			}));

			const scoop = new TransmissionScoop(this.transport, {
				localPort: this.options.localPort,
				timeout: this.options.responseTimeout,
				heartbeat: this.options.scoopHeartbeat,
			});

			const result = scoop.receive((sender, data) => {
				if (sender.addr !== this.options.server.addr) return false;

				const packet = tryParseRadpDataPacket(data);

				if (isNil(packet)) return false;

				return packet.uid === this.uid;
			});

			if (!isNil(result)) {
				return parseRadpDataPacket(result);
			}
		}

		throw 'retry limit exceeded';
	}

}

export default RequestExecutor;