import type { Peer, RawPacket } from '@lib/net/types';
import type Transport from '@lib/net/transport';
import { packAddr, isNil } from '@lib/util';
import * as uuid from 'uuid';
import { encodePacket, type TcpPacket, tryParsePacket, parsePacket } from '@lib/net/tcp/packet';
import { type StreamReader, consumeStream } from '@lib/std/StreamReader';
import { always, ofType, type PacketMatcher } from '@lib/net/tcp/util';

export interface TcpTransmissionOptions {
	packetSize: number;
	packetRetryCount: number;
	finalizeRetryCount: number;
	timeout?: number;
}

class Transmission {
	private readonly channelId: string;
	private data: string[] = [];

	private closed: boolean = false;

	private options: TcpTransmissionOptions;

	constructor(
		private transport: Transport,
		private peer: Peer,
		private localPort: number,
		options: TcpTransmissionOptions,
	) {
		this.channelId = packAddr(uuid.next());
		this.options = {
			timeout: 2,
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

	transmit() {
		this.closed = true;

		this.open();

		for (let id = 0; id < this.data.length; id++) {
			this.sendDataPacket(id);
		}

		this.finalize();
	}

	private finalize() {
		for (let i = 0; i < this.options.finalizeRetryCount; i++) {
			this.sendPacket({ type: 'FIN' });

			while (true) {
				const packet = this.tryReceivePacket(always(), this.options.timeout);

				if (isNil(packet)) {
					break;
				}

				if (packet?.type === 'FIN_ACK') {
					return;
				}

				if (packet?.type === 'REPT') {
					this.sendDataPacket(packet.seqNo);
				}
			}
		}

		throw 'failed to finalize transmission: timeout';
	}

	private open() {
		this.transport.open(this.localPort);

		for (let i = 0; i < this.options.packetRetryCount; i++) {
			this.sendPacket({ type: 'HELO' });

			const pkt = this.tryReceivePacket(
				ofType('ACK'),
				this.options.timeout,
			);

			if (!isNil(pkt)) {
				return;
			}
		}

		throw 'failed to open transmission: timeout';
	}

	private sendDataPacket(seqNo: number) {
		assert(seqNo < this.data.length);

		this.sendPacket({
			type: 'DATA',
			seqNo: seqNo,
			data: this.data[seqNo]!!,
		});
	}

	private sendPacket(packet: Partial<TcpPacket> & Pick<TcpPacket, 'type'>) {
		this.transport.sendPacket(this.peer, encodePacket(this.buildPacket(packet)));
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

	private matchPacket(cb: PacketMatcher) {
		return (raw: RawPacket) => {
			const packet = tryParsePacket(raw.data);

			if (isNil(packet)) return false;

			if (packet.chId !== this.channelId) return false;

			return cb(packet);
		};
	}
}

export default Transmission;