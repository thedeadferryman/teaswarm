import type { Addr, Component, EventArgs } from '@lib/types';
import * as component from 'component';
import * as event from 'event';
import type { Peer, RawPacket } from '@lib/net/types';
import { asComponent, isNil } from '@lib/util';


type OCSystemEvent<T extends OC.EventType> = LuaMultiReturn<[T, ...OC.EventMap[T]]>;

class Transport {
	private iface: OC.Components.Modem & Component;

	constructor(ifaceAddr: Addr) {
		const iface = component.proxy(ifaceAddr) as OC.Components.Modem;

		if (!iface) throw new Error(`Couldn't find network interface: ${ifaceAddr}`);

		this.iface = asComponent(iface);
	}

	sendPacket(peer: Peer, packetData: OC.Components.ModemData[]) {
		print('send packet ', peer.addr, peer.port, ...packetData);
		this.iface.send(peer.addr, peer.port, ...packetData);
	}

	open(port: number) {
		print('transport open port', port, this.iface);
		if (!this.iface.isOpen(port)) {
			print('transport open port do', port);
			this.iface.open(port);
		}
		print('transport open port done', port);
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
	): Promise<RawPacket> {
		return new Promise<RawPacket>((resolve, reject) => {
			const ctx = this;
			const listener = function (this: void, ...args: EventArgs<'modem_message'>) {
				if (ctx.checkPacketMatches(args, port, fromAddr)) {
					const [type, ...data] = args;
					const rawPacket = ctx.parsePacket(data);

					if (isNil(filter) || filter(rawPacket)) {
						resolve(rawPacket);
						event.ignore('modem_message', listener);
					}
				}
			};

			event.listen('modem_message', listener);
			if (!isNil(timeout)) {
				event.timer(timeout, () => {
					event.ignore('modem_message', listener);
					reject('timeout');
				});
			}
		});
	}


	receivePacketSync(
		port: number,
		fromAddr?: Addr,
		filter?: (packet: RawPacket) => boolean,
		timeout?: number,
	): RawPacket | undefined {
		const [type, ...eventData] = event.pullFiltered(timeout, (...args: EventArgs<'modem_message'>) => {
			const [_, ...packetData] = args;

			return this.checkPacketMatches(args, port, fromAddr) && (
				isNil(filter) || filter(this.parsePacket(packetData))
			);
		});

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
}

export default Transport;