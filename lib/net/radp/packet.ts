import type { NetworkData, Peer } from '@lib/net/types';
import { expect, packAddr, unpackAddr } from '@lib/util';
import type { RadpDataProvider } from '@lib/net/radp/DataProvider';

export const RadpControlPacketTypes = ['GET'] as const;
export type RadpControlPacketType = typeof RadpControlPacketTypes[number];

export interface RadpControlPacket {
	type: RadpControlPacketType;
	sender: Peer;
	uid: string;
	body: string;
}

export const isRadpControlPacketType = (value: unknown): value is RadpControlPacketType => (
	type(value) === 'string'
	&& RadpControlPacketTypes.includes(value as RadpControlPacketType)
);

export const encodeRadpControlPacket = (req: RadpControlPacket): NetworkData => {
	return [req.type, req.sender.addr, req.sender.port, req.uid, req.body];
};

const expectRadpControlPacketType = (value: unknown) => {
	if (isRadpControlPacketType(value)) {
		return value;
	} else {
		throw 'expected packet type';
	}
};

export const parseRadpControlPacket = (raw: NetworkData): RadpControlPacket => {
	const [type, senderAddr, senderPort, uid, body] = raw;

	return {
		type: expectRadpControlPacketType(type),
		sender: {
			addr: expect(senderAddr, 'string'),
			port: expect(senderPort, 'number'),
		},
		uid: expect(uid, 'string'),
		body: expect(body, 'string'),
	};
};

export const tryParseRadpControlPacket = (raw: NetworkData) => {
	try {
		return parseRadpControlPacket(raw);
	} catch {
		return undefined;
	}
};

export const RadpDataPacketTypes = ['DATA', 'ERROR'] as const;
export type RadpDataPacketType = typeof RadpDataPacketTypes[number];

export const isRadpDataPacketType = (value: unknown): value is RadpDataPacketType => (
	type('value') === 'string'
	&& RadpDataPacketTypes.includes(value as RadpDataPacketType)
);

export interface RadpDataPacket {
	type: RadpDataPacketType;
	uid: string;
	body: string;
}

const RadpDataPacketPattern = '< z z s';

export const encodeRadpDataPacket = (packet: RadpDataPacket) => {
	return string.pack(RadpDataPacketPattern, packet.type, packAddr(packet.uid), packet.body);
};

export const expectRadpDataPacketType = (value: unknown): RadpDataPacketType => {
	if (isRadpDataPacketType(value)) {
		return value;
	}

	throw 'expected packet type';
};

export const parseRadpDataPacket = (raw: string): RadpDataPacket => {
	const [type, uid, body] = string.unpack(RadpDataPacketPattern, raw);

	return {
		type: expectRadpDataPacketType(type),
		uid: unpackAddr(expect(uid, 'string')),
		body: expect(body, 'string'),
	};
};

export const tryParseRadpDataPacket = (raw: string): RadpDataPacket | undefined => {
	try {
		return parseRadpDataPacket(raw);
	} catch (e) {
		print('error: ', e);
		return undefined;
	}
};