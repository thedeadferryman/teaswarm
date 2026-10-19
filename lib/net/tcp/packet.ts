import type { NetworkData } from '@lib/net/types';
import { expect, isNil } from '@lib/util';

export enum TcpPacketType {
	HELO, ACK, DATA, DATA_ACK, REPT, FIN, FIN_ACK,
}

export interface TcpPacket {
	srcPort: number;
	destPort: number;
	type: TcpPacketType;
	seqNo: number;
	seqSize: number;
	chId: string;
	data: string;
}

export const encodePacket = (packet: TcpPacket): NetworkData => {
	return [packet.srcPort, packet.destPort, packet.type, packet.seqNo, packet.seqSize, packet.chId, packet.data];
};

const expectPacketType = (value: unknown): TcpPacketType => {
	const num = expect(value, 'number');

	if (isNil(TcpPacketType[num])) throw `expected a valid packet type, got ${value}`;

	return num;
};

export const parsePacket = (raw: NetworkData): TcpPacket => {
	const [srcPort, destPort, typeRaw, seqNo, seqSize, chId, data] = raw;

	return {
		data: tostring(data),
		srcPort: expect(srcPort, 'number'),
		destPort: expect(destPort, 'number'),
		type: expectPacketType(typeRaw),
		seqNo: expect(seqNo, 'number'),
		seqSize: expect(seqSize, 'number'),
		chId: expect(chId, 'string'),
	};
};

export const tryParsePacket = (raw: NetworkData) => {
	try {
		return parsePacket(raw);
	} catch {
		return undefined;
	}
};