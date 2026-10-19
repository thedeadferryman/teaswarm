import type Transport from '@lib/net/transport';
import RequestExecutor from '@lib/net/radp/RequestExecutor';
import { type RadpClientOptions, DefaultOptions } from '@lib/net/radp/ClientOptions';


class RadpClient {
	private readonly options: RadpClientOptions;

	constructor(
		private readonly transport: Transport,
		options: Partial<RadpClientOptions> & Omit<RadpClientOptions, keyof typeof DefaultOptions>,
	) {
		this.options = {
			...DefaultOptions,
			...options,
		};
	}

	get(resource: string) {
		const executor = new RequestExecutor(this.transport, resource, this.options);

		return executor.execute();
	}
}

export default RadpClient;