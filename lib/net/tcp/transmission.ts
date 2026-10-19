import type { Peer, RawPacket } from '@lib/net/types';
import type Transport from '@lib/net/transport';
import { packAddr, isNil } from '@lib/util';
import * as uuid from 'uuid';
import { encodePacket, type TcpPacket, tryParsePacket, parsePacket } from '@lib/net/tcp/packet';
import { type StreamReader, consumeStream } from '@lib/std/StreamReader';
import { always, ofType, type PacketMatcher } from '@lib/net/tcp/util';

export interface ConnectionOptions {
	packetSize: number;
	packetRetryCount: number;
	timeout?: number;
	closureTimeout?: number;
}

class Transmission {
	private readonly channelId: string;
	private data: string[] = [];

	private closed: boolean = false;

	private options: ConnectionOptions;

	constructor(
		private transport: Transport,
		private peer: Peer,
		private localPort: number,
		options: ConnectionOptions,
	) {
		this.channelId = packAddr(uuid.next());
		this.options = {
			timeout: 2,
			closureTimeout: 10,
			...options,
		};
	}

	isClosed() {
		return this.closed;
	}

	write(stream: StreamReader) {
		if (this.isClosed()) {
			throw 'trying to write to a closed transmission!';
		}

		consumeStream(stream, this.options.packetSize, buf => {
			this.data.push(buf);
		});
	}

	execute() {
		this.closed = true;

		this.open();

		for (let id = 0; id < this.data.length; id++) {
			this.sendDataPacket(id);
		}

		this.transport.sendPacket(this.peer, encodePacket(this.buildPacket({
			type: 'FIN',
		})));

		while (true) {
			const packet = this.tryReceivePacket(always(), this.options.closureTimeout);

			if (isNil(packet)) {
				throw 'timeout';
			}

			if (packet?.type === 'FIN_ACK') {
				break;
			}

			if (packet?.type === 'REPT') {
				this.sendDataPacket(packet.seqNo);
			}
		}
	}

	private open() {
		try {
			this.transport.open(this.localPort);
		} catch (e) {
		}

		this.transport.sendPacket(this.peer, encodePacket(this.buildPacket({
			type: 'HELO',
		})));

		this.receivePacket(
			ofType('ACK'),
			this.options.timeout,
		);
	}

	private sendDataPacket(seqNo: number) {
		assert(seqNo < this.data.length);

		this.transport.sendPacket(this.peer, encodePacket(this.buildPacket({
			type: 'DATA',
			seqNo: seqNo,
			data: this.data[seqNo]!!,
		})));
	}

	private matchPacket(cb: PacketMatcher) {
		return (raw: RawPacket) => {
			const packet = tryParsePacket(raw.data);

			if (isNil(packet)) return false;

			if (packet.chId !== this.channelId) return false;

			return cb(packet);
		};
	}

	private buildPacket(packet: Partial<TcpPacket> & Pick<TcpPacket, 'type'>): TcpPacket {
		return {
			srcPort: this.localPort,
			destPort: this.peer.port,
			seqNo: 0,
			seqSize: this.data.length,
			chId: this.channelId,
			data: '',
			...packet,
		};
	}

	private receivePacket(matcher: PacketMatcher, timeout?: number) {
		const raw = this.transport.receivePacket(
			this.localPort,
			this.peer.addr,
			this.matchPacket(matcher),
			timeout,
		);

		return parsePacket(raw.data);
	}

	private tryReceivePacket(matcher: PacketMatcher, timeout?: number) {
		const raw = this.transport.tryReceivePacket(
			this.localPort,
			this.peer.addr,
			this.matchPacket(matcher),
			timeout,
		);

		if (isNil(raw)) return;

		return parsePacket(raw.data);
	}
}

export default Transmission;