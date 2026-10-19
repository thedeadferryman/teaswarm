import type { Peer } from '@lib/net/types';

export interface RadpClientOptions {
	localPort: number;
	server: Peer;
	retryCount: number;
	responseTimeout: number;
	scoopHeartbeat: number;
}

export const DefaultOptions = {
	scoopHeartbeat: 0.3,
} as const;
