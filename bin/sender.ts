import { asComponent } from '@lib/util';
import * as component from 'component';
import Transport from '@lib/net/transport';
import Transmission from '@lib/net/tcp/transmission';
import { StringReader } from '@lib/std/StreamReader';
import { lossy } from '@lib/net/debug';

const destAddr = 'aedd0093-0b48-45fd-b504-5bd69e35e489';

const modem = asComponent(component.getPrimary('modem'));

const transport = new Transport(modem.address, {
	debug: {
		logging: true,
		decorators: {
			send: lossy({
				name: 'tx:sendPacket',
				trace: false,
				chance: 20,
			}),
		},
	},
	signalInterceptors: {
		interrupted: () => {
			print('Interrupted');
			os.exit();
		},
	},
});

const txm = new Transmission(transport, { addr: destAddr, port: 27 }, 27, {
	packetSize: 4,
	packetRetryCount: 3,
	timeout: 5,
	finalizeRetryCount: 10,
});

const stream = new StringReader('Lorem ipsum un dolor sit amet');

txm.write(stream);

txm.transmit();
