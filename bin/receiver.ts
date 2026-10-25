import { asComponent } from '@lib/util';
import * as component from 'component';
import Transport from '@lib/net/transport';
import Receptionist from '@lib/net/tcp/receptionist';
import ThreadPool from '@lib/rt/threadpool';

const modem = asComponent(component.getPrimary('modem'));

const transport = new Transport(modem.address, {
	debug: {
		logging: false,
	},
	signalInterceptors: {
		interrupted: () => {
			print('Interrupted');
			os.exit();
		},
	},
});

const server = new Receptionist(transport, ThreadPool.default(), {
	localPort: 27,
	heartbeat: 0.5,
	channelTimeout: 10,
});

print('Started server on port 27');

server.listen({
	onMessage: (peer, data) => {
		print(`From ${peer.addr}:${peer.port}: `, data);
	},
});