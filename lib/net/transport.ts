import type { Addr, Component, EventArgs } from '@lib/types';
import * as component from 'component';
import * as event from 'event';
import type { Peer, RawPacket, NetworkData } from '@lib/net/types';
import { asComponent, isNil } from '@lib/util';
import type { Decorator } from '@lib/net/debug';

type StrictInterceptor<K extends OC.EventType> = (event: OC.EventMap[K]) => void;
type Interceptor<K> = K extends OC.EventType ? StrictInterceptor<K> : (event: any[]) => void;

export interface TransportOptions {
	debug?: {
		logging?: boolean;
		decorators?: {
			send: Decorator<[Peer, NetworkData], unknown>;
		};
	};
	signalInterceptors?: {
		[k: string]: Interceptor<OC.EventType>;
	};
}

class Transport {
	private iface: OC.Components.Modem & Component;

	constructor(
		ifaceAddr: Addr,
		private options: TransportOptions,
	) {
		const iface = component.proxy(ifaceAddr) as OC.Components.Modem;

		if (!iface) throw new Error(`Couldn't find network interface: ${ifaceAddr}`);

		this.iface = asComponent(iface);
	}

	get address(): string {
		return this.iface.address;
	}

	sendPacket(peer: Peer, packetData: NetworkData) {
		this.trace('tx packet to send', ...packetData);
		const decor = this.options.debug?.decorators?.send;

		if (isNil(decor)) {
			return this.doSend(peer, packetData);
		}

		const decorated = decor((...args) => this.doSend(...args));

		return decorated(peer, packetData);
	}

	private doSend(peer: Peer, packetData: NetworkData) {
		this.trace('tx packet send', peer.addr, peer.port, ...packetData);
		this.iface.send(peer.addr, peer.port, ...packetData);
	}

	open(port: number) {
		if (!this.iface.isOpen(port)) {
			this.iface.open(port);
		}
	}

	parsePacket([recvAddr, senderAddr, recvPort, _, ...data]: OC.EventMap['modem_message']): RawPacket {
		return {
			receiver: {
				addr: recvAddr,
				port: recvPort,
			},
			sender: senderAddr,
			data: data,
		};
	}

	receivePacket(
		port: number,
		fromAddr?: Addr,
		filter?: (packet: RawPacket) => boolean,
		timeout?: number,
	): RawPacket {
		const received = this.tryReceivePacket(port, fromAddr, filter, timeout);

		if (isNil(received)) throw 'timeout';

		return received;
	}

	tryReceivePacket(
		port: number,
		fromAddr?: Addr,
		filter?: (packet: RawPacket) => boolean,
		timeout?: number,
	) {
		const [type, ...eventData] = event.pullFiltered(timeout, (...args: EventArgs<'modem_message'>) => {
			const [type, ...packetData] = args;

			if (!isNil(this.options.signalInterceptors?.[type as OC.EventType])) return true;

			return this.checkPacketMatches(args, port, fromAddr) && (
				isNil(filter) || filter(this.parsePacket(packetData))
			);
		});

		const interceptor = this.options.signalInterceptors?.[type as OC.EventType];

		if (!isNil(interceptor)) {
			(interceptor as Function)(eventData);
		}

		if (type != null) {
			return this.parsePacket(eventData as OC.EventMap['modem_message']);
		}
	}

	private checkPacketMatches(
		[type, recvAddr, senderAddr, recvPort]: EventArgs<'modem_message'>,
		port: number,
		fromAddr?: Addr,
	) {
		return (
			type == 'modem_message'
			&& recvAddr == this.iface.address
			&& recvPort == port
			&& (!fromAddr || fromAddr == senderAddr)
		);
	}

	private trace(...data: unknown[]) {
		if (this.options.debug?.logging) {
			print(...data);
		}
	}
}

export default Transport;