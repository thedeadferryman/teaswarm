import type { Peer, RawPacket } from '@lib/net/types';
import { type TcpPacket, parsePacket, tryParsePacket, encodePacket } from '@lib/net/tcp/packet';
import type Transport from '@lib/net/transport';
import { type PacketMatcher, always } from '@lib/net/tcp/util';
import { isNil } from '@lib/util';


class Reception {
	private readonly localPort: number;
	private readonly channelId: string;
	private data: Partial<Record<number, string>> = {};
	private seqSize: number;

	constructor(
		private readonly transport: Transport,
		private readonly peer: Peer,
		helo: TcpPacket,
	) {
		this.localPort = helo.destPort;
		this.channelId = helo.chId;
		this.seqSize = helo.seqSize;
	}

	receive() {
		this.sendPacket({
			type: 'ACK',
		});

		let finalize = false;

		while (true) {
			const packet = this.receivePacket(always());

			if (packet.type === 'DATA' && isNil(this.data[packet.seqNo])) {
				this.data[packet.seqNo] = packet.data;
				continue;
			}

			if (packet.type === 'FIN' || finalize) {
				finalize = true;
				const missing = this.findMissingPackets();

				let misses = 0;

				for (const seqNo of missing) {
					if (!isNil(seqNo)) {
						misses += 1;
						this.sendPacket({
							type: 'REPT',
							seqNo: seqNo,
						});
					}
				}

				if (misses <= 0) {
					this.sendPacket({
						type: 'FIN_ACK',
					});
					break;
				}
			}
		}

		return this.buildResult();
	}

	private buildResult() {
		let result = '';

		for (let i = 0; i < this.seqSize; i++) {
			result += this.data[i];
		}

		return result;
	}

	private findMissingPackets() {
		const result = [];

		for (let i = 0; i < this.seqSize; i++) {
			if (isNil(this.data[i])) result.push(i);
		}

		return result;
	}

	private sendPacket(packet: Partial<TcpPacket> & Pick<TcpPacket, 'type'>) {
		this.transport.sendPacket(this.peer, encodePacket(this.buildPacket(packet)));
	}

	private buildPacket(packet: Partial<TcpPacket> & Pick<TcpPacket, 'type'>): TcpPacket {
		return {
			srcPort: this.localPort,
			destPort: this.peer.port,
			seqNo: 0,
			seqSize: 0,
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

	private matchPacket(matcher: PacketMatcher) {
		return (raw: RawPacket) => {
			const packet = tryParsePacket(raw.data);

			if (isNil(packet)) return false;

			if (packet.chId !== this.channelId) return false;

			return matcher(packet);
		};
	}
}


export default Reception;