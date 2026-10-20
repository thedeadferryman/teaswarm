import type { Peer, RawPacket } from '@lib/net/types';
import { type TcpPacket, tryParsePacket, encodePacket } from '@lib/net/tcp/packet';
import type Transport from '@lib/net/transport';
import { type PacketMatcher, always } from '@lib/net/tcp/util';
import { isNil } from '@lib/util';

export interface ReceptionOptions {
	timeout: number;
}

class Reception {
	private readonly localPort: number;
	private readonly channelId: string;
	private data: Partial<Record<number, string>> = {};
	private readonly seqSize: number;

	constructor(
		private readonly transport: Transport,
		private readonly peer: Peer,
		helo: TcpPacket,
		private readonly options: ReceptionOptions,
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
			const packet = this.tryReceivePacket(always(), this.options.timeout);

			if (isNil(packet)) throw 'timeout';

			if (packet.type === 'DATA' && isNil(this.data[packet.seqNo])) {
				this.data[packet.seqNo] = packet.data;

				if (finalize) {
					const missing = this.findMissingPackets();

					if (missing.length <= 0) {
						this.sendPacket({
							type: 'FIN_ACK',
						});
					}
				}

				continue;
			}

			if (packet.type === 'FIN' || finalize) {
				finalize = true;
				const missing = this.findMissingPackets();

				if (missing.length <= 0) {
					this.sendPacket({
						type: 'FIN_ACK',
					});
					break;
				}

				for (const seqNo of missing) {
					this.sendPacket({
						type: 'REPT',
						seqNo: seqNo,
					});
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

	private tryReceivePacket(matcher: PacketMatcher, timeout?: number) {
		const raw = this.transport.tryReceivePacket(
			this.localPort,
			this.peer.addr,
			this.matchPacket(matcher),
			timeout,
		);

		if (isNil(raw)) return;

		return tryParsePacket(raw.data);
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