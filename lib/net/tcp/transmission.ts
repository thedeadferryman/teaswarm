import type { Peer, RawPacket } from '@lib/net/types';
import type Transport from '@lib/net/transport';
import { packAddr, isNil } from '@lib/util';
import * as uuid from 'uuid';
import { TcpPacketType, encodePacket, type TcpPacket, tryParsePacket, parsePacket } from '@lib/net/tcp/packet';
import { type StreamReader, consumeStream } from '@lib/std/StreamReader';

export interface ConnectionOptions {
	packetSize: number;
	packetRetryCount: number;
	timeout?: number;
	closureTimeout?: number;
}

type PacketMatcher = (packet: TcpPacket) => boolean;

const always = (): PacketMatcher => () => true;

const ofType = (type: TcpPacketType): PacketMatcher => (
	packet => packet.type === type
);

const seqNoIs = (seqNo: number): PacketMatcher => (
	packet => packet.seqNo === seqNo
);

const allOf = (...matchers: PacketMatcher[]): PacketMatcher => (
	(packet: TcpPacket) => !(
		matchers
			.some(matcher => !matcher(packet))
	)
);

class Transmission {
	private readonly channelId: string;
	private data: string[] = [];

	private closed: boolean = false;

	private options: ConnectionOptions;

	constructor(
		private transport: Transport,
		private peer: Peer,
		private recvPort: number,
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

	async execute() {
		this.closed = true;

		print('start TXM execute');

		await this.open();

		for (let id = 0; id < this.data.length; id++) {
			await this.sendDataPacket(id);
		}

		this.transport.sendPacket(this.peer, encodePacket(this.buildPacket({
			type: TcpPacketType.FIN,
		})));

		while (true) {
			try {
				const packet = await this.receivePacket(always(), this.options.closureTimeout);

				if (packet.type === TcpPacketType.FIN_ACK) {
					break;
				}

				if (packet.type === TcpPacketType.REPT) {
					await this.sendDataPacket(packet.seqNo);
				}
			} catch {

			}
		}
	}

	private async open() {
		print('TXM open seq start');
		try {
			this.transport.open(this.recvPort);
		} catch (e) {
			print('TXM open port fail', e);
		}

		print('TXM open seq follow');

		this.transport.sendPacket(this.peer, encodePacket(this.buildPacket({
			type: TcpPacketType.HELO,
		})));

		await this.receivePacket(
			ofType(TcpPacketType.ACK),
			this.options.timeout,
		);
	}

	private async sendDataPacket(seqNo: number) {
		assert(seqNo < this.data.length);

		this.transport.sendPacket(this.peer, encodePacket(this.buildPacket({
			type: TcpPacketType.DATA,
			seqNo: seqNo,
			data: this.data[seqNo]!!,
		})));

		for (let att = 0; att < this.options.packetRetryCount; att++) {
			try {
				await this.receivePacket(
					allOf(
						ofType(TcpPacketType.DATA_ACK),
						seqNoIs(seqNo),
					),
					this.options.timeout,
				);
				return;
			} catch {
				// ignore
			}
		}

		throw 'packet send retry limit exceeded';
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
			srcPort: this.recvPort,
			destPort: this.peer.port,
			seqNo: 0,
			seqSize: this.data.length,
			chId: this.channelId,
			data: '',
			...packet,
		};
	}

	private receivePacket(matcher: PacketMatcher, timeout?: number) {
		return this.transport.receivePacket(
			this.recvPort,
			this.peer.addr,
			this.matchPacket(matcher),
			timeout,
		).then(raw => parsePacket(raw.data));
	}
}

export default Transmission;