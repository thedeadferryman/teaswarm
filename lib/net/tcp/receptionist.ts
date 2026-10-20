import type Transport from '@lib/net/transport';
import { type PacketMatcher, ofType, anyOf } from '@lib/net/tcp/util';
import type { RawPacket, Peer } from '@lib/net/types';
import { tryParsePacket, parsePacket, type TcpPacket, encodePacket, type TcpPacketType } from '@lib/net/tcp/packet';
import { isNil } from '@lib/util';
import Reception from '@lib/net/tcp/reception';
import ThreadPool from '@lib/std/ThreadPool';
import type { Addr } from '@lib/types';
import * as computer from 'computer';

export interface ReceptionistController {
	shutdown: (force?: boolean) => unknown;
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
	remnantLifetime: number;
}

export interface ReceptionistCallbacks {
	onMessage: MessageHandler;
	onHeartbeat?: (controller: ReceptionistController) => unknown;
}

const REMNANT_CLEANUP_LIMIT = 250;

class Receptionist {
	private readonly options: ReceptionistOptions;

	private channels: string[] = [];
	private remnants: Partial<Record<string, number>> = {};
	private controller: ReceptionistController = {
		shutdown: () => undefined,
	};

	constructor(
		private readonly transport: Transport,
		private readonly threadPool: ThreadPool,
		options: Partial<ReceptionistOptions> & Omit<ReceptionistOptions, 'remnantLifetime'>,
	) {
		this.options = {
			remnantLifetime: 30,
			...options,
		};
	}

	listen(callbacks: ReceptionistCallbacks): void {
		this.transport.open(this.options.localPort);

		let shutdownFlag = false;

		this.controller = {
			shutdown: (force?: boolean) => {
				shutdownFlag = true;

				if (force) this.threadPool.terminate();
			},
		};
		this.remnants = {};
		this.channels = [];

		while (true) {
			callbacks.onHeartbeat?.(this.controller);

			if (shutdownFlag) {
				break;
			}

			this.threadPool.refresh();
			this.cleanupRemnants();

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

				switch (packet.type) {
					case 'FIN':
						this.handleFIN(packet, sender, channelDiscriminator);
						break;
					case 'HELO':
						this.handleHELO(packet, sender, channelDiscriminator, callbacks);
				}
			}
		}

		this.threadPool.join();
	}

	private handleHELO(
		packet: TcpPacket,
		sender: Addr,
		channelDiscriminator: string,
		callbacks: ReceptionistCallbacks,
	) {
		if (this.channels.includes(channelDiscriminator)) {
			this.sendControlPacket(sender, packet, 'ACK');
			return;
		}

		const threadAdded = this.processTransmission(
			packet, sender,
			callbacks.onMessage,
			successful => {
				this.channels = this.channels.filter(ch => ch !== channelDiscriminator);

				if (successful) {
					this.remnants[channelDiscriminator] = computer.uptime() + this.options.remnantLifetime;
				}
			},
		);

		if (threadAdded) this.channels.push(channelDiscriminator);
	}

	private handleFIN(packet: TcpPacket, sender: Addr, discr: string) {
		if (packet.type === 'FIN' && !isNil(this.remnants[discr])) {
			this.sendControlPacket(sender, packet, 'FIN_ACK');
		}
	}

	private cleanupRemnants() {
		const remnantKeys = Object.keys(this.remnants);

		if (remnantKeys.length > REMNANT_CLEANUP_LIMIT) {
			this.remnants = {};
			return;
		}

		for (const key of remnantKeys) {
			if (isNil(this.remnants[key]) || this.remnants[key] >= computer.uptime()) {
				delete this.remnants[key];
			}
		}
	}

	private sendControlPacket(
		sender: Addr,
		packet: TcpPacket,
		type: TcpPacketType,
	) {
		return this.transport.sendPacket({ addr: sender, port: packet.srcPort }, encodePacket({
			type,
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
			reception, peer, onMessage, this.controller,
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