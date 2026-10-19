import type Transport from '@lib/net/transport';
import { type PacketMatcher, ofType } from '@lib/net/tcp/util';
import type { RawPacket, Peer } from '@lib/net/types';
import { tryParsePacket, parsePacket } from '@lib/net/tcp/packet';
import { isNil } from '@lib/util';
import * as thread from 'thread';
import Reception from '@lib/net/tcp/reception';

export interface ReceptionistController {
	shutdown: () => void;
}

type MessageHandler = (
	sender: Peer,
	data: string,
	controller: ReceptionistController,
) => unknown;

const THREAD_WATCH_THRESHOLD = 20;

class Receptionist {
	constructor(
		private readonly transport: Transport,
		private readonly localPort: number,
		private readonly heartbeat: number,
	) {

	}

	listen(
		onData: MessageHandler,
		onHeartbeat?: (controller: ReceptionistController) => unknown,
	) {
		let threads = [];
		let shutdownFlag = false;

		const controller = {
			shutdown: () => {
				shutdownFlag = true;
			},
		} satisfies ReceptionistController;

		this.transport.open(this.localPort);

		while (true) {
			if (shutdownFlag) {
				break;
			}

			if (threads.length >= THREAD_WATCH_THRESHOLD) {
				threads = [];
			}

			onHeartbeat?.(controller);

			const evt = this.transport.tryReceivePacket(
				this.localPort,
				undefined,
				this.matchPacket(ofType('HELO')),
				this.heartbeat,
			);

			if (!isNil(evt)) {
				threads.push(this.processTransmission(evt, onData, controller));
			}
		}

		thread.waitForAll(threads);
	}

	private processTransmission(
		rawPacket: RawPacket,
		onMessage: MessageHandler,
		controller: ReceptionistController,
	) {
		const packet = parsePacket(rawPacket.data);
		const peer = { addr: rawPacket.sender, port: packet.srcPort };
		const reception = new Reception(
			this.transport, peer, packet,
		);

		return thread.create(
			(reception: Reception, peer: Peer, onData: MessageHandler, controller: ReceptionistController) => {
				const data = reception.receive();

				onData(peer, data, controller);
			},
			reception, peer, onMessage, controller,
		);
	}

	private matchPacket(matcher?: PacketMatcher) {
		return (raw: RawPacket) => {
			const packet = tryParsePacket(raw.data);

			if (isNil(packet)) return false;

			return isNil(matcher) || matcher(packet);
		};
	}
}

export default Receptionist;