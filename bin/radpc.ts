import RadpClient from '@lib/net/radp/client';
import Transport from '@lib/net/transport';
import { asComponent, isNil } from '@lib/util';
import * as component from 'component';

const modem = asComponent(component.getPrimary('modem'));

const transport = new Transport(modem.address, {
	debug: {}
});

const client = new RadpClient(transport, {
	server: {
		addr: 'aedd0093-0b48-45fd-b504-5bd69e35e489',
		port: 24,
	},
	localPort: 25,
	retryCount: 3,
	responseTimeout: 5,
});

while (true) {
	const request = io.read('l');

	if (isNil(request)) continue;

	if (request === 'int') break;
	try {
		const result = client.get(request);

		print(result.type, result.body);
	} catch (error) {
		print('error: ', error);
	}
}