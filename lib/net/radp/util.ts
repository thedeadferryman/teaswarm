import type { RadpControlPacket, RadpControlPacketType } from '@lib/net/radp/packet';

export type PacketMatcher = (pkt: RadpControlPacket) => boolean;

export const ofType = (type: RadpControlPacketType): PacketMatcher => (
	pkt => pkt.type === type
);

