import type Transport from '@lib/net/transport';
import type { RawPacket } from '@lib/net/types';
import { tryParseRadpControlPacket, parseRadpControlPacket, type RadpControlPacket } from '@lib/net/radp/packet';
import { isNil } from '@lib/util';
import { type PacketMatcher, ofType } from '@lib/net/radp/util';
import type { TcpTransmissionOptions } from '@lib/net/tcp/transmission';
import type { RadpDataProvider } from '@lib/net/radp/DataProvider';
import RequestHandler from '@lib/net/radp/RequestHandler';
import * as thread from 'thread';

export interface RadpServerOptions {
	controlPort: number;
	heartbeat: number;
	tcpPort: number;
	tcpOptions: TcpTransmissionOptions,
}

export interface RadpServerController {
	shutdown: () => unknown;
}

export interface RadpServerCallbacks {
	onRequest?: (controller: RadpServerController, client: string, request: RadpControlPacket) => void;
	onAfterRequest?: (controller: RadpServerController, client: string, request: RadpControlPacket) => void;
	onHeartbeat?: (controller: RadpServerController) => unknown;
}

class RadpServer {
	constructor(
		private transport: Transport,
		private dataProvider: RadpDataProvider,
		private options: RadpServerOptions,
	) {

	}

	start(callbacks?: RadpServerCallbacks) {
		this.transport.open(this.options.controlPort);

		let shutdownFlag = false;

		const controller = {
			shutdown: () => {
				shutdownFlag = true;
			},
		} satisfies RadpServerController;

		while (true) {
			callbacks?.onHeartbeat?.(controller);

			if (shutdownFlag) {
				break;
			}

			const pkt = this.transport.tryReceivePacket(
				this.options.controlPort,
				undefined,
				this.matchPacket(ofType('GET')),
				this.options.heartbeat,
			);

			if (!isNil(pkt)) {
				const req = parseRadpControlPacket(pkt.data);

				callbacks?.onRequest?.(controller, pkt.sender, req);

				this.processRequest(req);

				callbacks?.onAfterRequest?.(controller, pkt.sender, req);
			}
		}
	}

	private processRequest(
		request: RadpControlPacket,
	) {
		const handler = new RequestHandler(
			this.transport,
			this.dataProvider,
			request,
			this.options,
		);

		return thread.create((handler: RequestHandler) => {
			handler.process();
		}, handler);
	}

	private matchPacket(matcher: PacketMatcher) {
		return (raw: RawPacket) => {
			const req = tryParseRadpControlPacket(raw.data);

			if (isNil(req)) return false;

			return matcher(req);
		};
	}
}

export default RadpServer;