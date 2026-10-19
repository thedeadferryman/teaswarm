import type Transport from '@lib/net/transport';
import { type PacketMatcher, ofType } from '@lib/net/tcp/util';
import type { RawPacket, Peer } from '@lib/net/types';
import { tryParsePacket, parsePacket } from '@lib/net/tcp/packet';
import { isNil } from '@lib/util';
import * as thread from 'thread';
import Reception from '@lib/net/tcp/reception';

type MessageHandler = (sender: Peer, data: string) => unknown;

class Receptionist {
	constructor(
		private readonly transport: Transport,
		private readonly localPort: number,
		private readonly heartbeat: number,
	) {

	}

	listen(onData: MessageHandler) {
		const threads = [];

		this.transport.open(this.localPort);

		while (true) {
			const evt = this.transport.tryReceivePacket(
				this.localPort,
				undefined,
				this.matchPacket(ofType('HELO')),
			);

			if (!isNil(evt)) {
				threads.push(this.processTransmission(evt, onData));
			}
		}

		thread.waitForAll(threads);
	}

	private processTransmission(rawPacket: RawPacket, onData: MessageHandler) {
		const packet = parsePacket(rawPacket.data);
		const peer = { addr: rawPacket.sender, port: packet.srcPort };
		const reception = new Reception(
			this.transport, peer, packet,
		);

		return thread.create(
			(reception: Reception, peer: Peer, onData: MessageHandler) => {
				const data = reception.receive();

				onData(peer, data);
			},
			reception, peer, onData,
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