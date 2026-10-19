import { type TcpPacket, TcpPacketType } from '@lib/net/tcp/packet';

export type PacketMatcher = (packet: TcpPacket) => boolean;

export const always = (): PacketMatcher => () => true;

export const ofType = (type: TcpPacketType): PacketMatcher => (
	packet => packet.type === type
);

export const seqNoIs = (seqNo: number): PacketMatcher => (
	packet => packet.seqNo === seqNo
);

export const allOf = (...matchers: PacketMatcher[]): PacketMatcher => (
	(packet: TcpPacket) => !(
		matchers
			.some(matcher => !matcher(packet))
	)
);
