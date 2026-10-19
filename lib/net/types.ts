import type { Addr } from '@lib/types';

export interface Peer {
	addr: Addr;
	port: number;
}

export type NetworkData = OC.Components.ModemData[];

export interface RawPacket {
	receiver: Peer;
	sender: Addr;

	data: NetworkData;
}
