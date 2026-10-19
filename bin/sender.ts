import { asComponent } from '@lib/util';
import * as component from 'component';
import Transport from '@lib/net/transport';
import Transmission from '@lib/net/tcp/transmission';
import { StringReader } from '@lib/std/StreamReader';
import { lossy } from '@lib/net/debug';

const destAddr = 'cc2dbcf8-abe7-4e6f-b5f9-1d4337ca24b4';

const modem = asComponent(component.getPrimary('modem'));

math.randomseed(220);

const transport = new Transport(modem.address, {
	debug: {
		logging: true,
		decorators: {
			send: lossy({
				name: 'tx:sendPacket',
				trace: true,
				chance: 20,
			}),
		},
	},
});

const txm = new Transmission(transport, { addr: destAddr, port: 27 }, 27, {
	packetSize: 4,
	packetRetryCount: 3,
	timeout: 20,
	closureTimeout: 120,
});

const stream = new StringReader('Lorem ipsum un dolor sit amet');

txm.write(stream);

txm.execute();
