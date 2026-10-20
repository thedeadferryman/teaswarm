import type Transport from '@lib/net/transport';
import { type PacketMatcher, ofType, anyOf } from '@lib/net/tcp/util';
import type { RawPacket, Peer } from '@lib/net/types';
import { tryParsePacket, parsePacket, type TcpPacket, encodePacket } from '@lib/net/tcp/packet';
import { isNil } from '@lib/util';
import Reception from '@lib/net/tcp/reception';
import ThreadPool from '@lib/std/ThreadPool';
import type { Addr } from '@lib/types';

export interface ReceptionistController {
	shutdown: (force?: boolean) => void;
}

type MessageHandler = (
	sender: Peer,
	data: string,
	controller: ReceptionistController,
) => unknown;

export interface ReceptionistOptions {
	localPort: number;
	heartbeat: number;
	channelTimeout: number;
}

export interface ReceptionistCallbacks {
	onMessage: MessageHandler;
	onHeartbeat?: (controller: ReceptionistController) => unknown;
}

const REMNANT_CLEANUP_LIMIT = 80;

class Receptionist {
	constructor(
		private readonly transport: Transport,
		private readonly threadPool: ThreadPool,
		private readonly options: ReceptionistOptions,
	) {
	}

	listen(callbacks: ReceptionistCallbacks): void {
		this.transport.open(this.options.localPort);

		let shutdownFlag = false;

		const controller = {
			shutdown: (force?: boolean) => {
				shutdownFlag = true;

				if (force) this.threadPool.terminate();
			},
		} satisfies ReceptionistController;

		let channels: string[] = [];
		let remnants: string[] = [];

		while (true) {
			callbacks.onHeartbeat?.(controller);

			if (shutdownFlag) {
				break;
			}

			if (remnants.length > REMNANT_CLEANUP_LIMIT) {
				remnants = [];
			}

			this.threadPool.refresh();

			const evt = this.transport.tryReceivePacket(
				this.options.localPort,
				undefined,
				this.matchPacket(
					anyOf(
						ofType('HELO'),
						ofType('FIN'),
					),
				),
				this.options.heartbeat,
			);

			if (!isNil(evt)) {
				const packet = parsePacket(evt.data);
				const sender = evt.sender;
				const channelDiscriminator = `${sender}:${packet.chId}`;

				if (packet.type === 'FIN' && remnants.includes(channelDiscriminator)) {
					this.closeRemnant(sender, packet);
					remnants = remnants.filter(ch => ch !== channelDiscriminator);
				}

				if (
					packet.type === 'HELO'
					&& !channels.includes(channelDiscriminator)
				) {
					const threadAdded = this.processTransmission(
						packet, sender,
						controller,
						callbacks.onMessage,
						successful => {
							channels = channels.filter(ch => ch !== channelDiscriminator);

							if (successful) {
								remnants.push(channelDiscriminator);
							}
						},
					);

					if (threadAdded) channels.push(channelDiscriminator);
				}
			}
		}

		this.threadPool.join();
	}

	private closeRemnant(sender: Addr, packet: TcpPacket): void {
		this.transport.sendPacket({ addr: sender, port: packet.srcPort }, encodePacket({
			type: 'FIN_ACK',
			chId: packet.chId,
			data: '',
			srcPort: this.options.localPort,
			destPort: packet.srcPort,
			seqNo: 0,
			seqSize: 0,
		}));
	}

	private processTransmission(
		packet: TcpPacket,
		sender: Addr,
		controller: ReceptionistController,
		onMessage: MessageHandler,
		onProcessed: (successful: boolean) => unknown,
	) {
		const peer = { addr: sender, port: packet.srcPort };
		const reception = new Reception(
			this.transport,
			peer,
			packet,
			{ timeout: this.options.channelTimeout },
		);

		return this.threadPool.dispatch(
			(reception: Reception, peer: Peer, onData: MessageHandler, controller: ReceptionistController) => {
				let succeeded = false;
				try {
					const data = reception.receive();

					onData(peer, data, controller);
					succeeded = true;
				} finally {
					onProcessed(succeeded);
				}
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