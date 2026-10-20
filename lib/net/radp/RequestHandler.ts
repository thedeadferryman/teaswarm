import { type RadpControlPacket, type RadpDataPacket, encodeRadpDataPacket } from '@lib/net/radp/packet';
import type Transport from '@lib/net/transport';
import type { RadpServerOptions } from '@lib/net/radp/server';
import type { RadpDataProvider } from '@lib/net/radp/DataProvider';
import Transmission from '@lib/net/tcp/transmission';
import { StringReader } from '@lib/std/StreamReader';

class RequestHandler {
	constructor(
		private readonly transport: Transport,
		private readonly dataProvider: RadpDataProvider,
		private readonly request: RadpControlPacket,
		private readonly options: RadpServerOptions,
	) {
	}

	process() {
		const resource = this.dataProvider.get(this.request.body);

		this.sendResponse({
			body: resource.body,
			type: resource.success ? 'DATA' : 'ERROR',
		});
	}

	private sendResponse(resp: Pick<RadpDataPacket, 'type' | 'body'>) {
		const packet = encodeRadpDataPacket({
			uid: this.request.uid,
			...resp,
		});

		const txm = new Transmission(
			this.transport,
			this.request.sender,
			this.options.tcpPort,
			this.options.tcpOptions,
		);

		txm.write(new StringReader(packet));

		txm.transmit();
	}
}

export default RequestHandler;