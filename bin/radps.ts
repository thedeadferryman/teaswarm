import { asComponent } from '@lib/util';
import * as component from 'component';
import Transport from '@lib/net/transport';
import RadpServer from '@lib/net/radp/server';
import { InMemoryDataProvider } from '@lib/net/radp/DataProvider';
import * as event from 'event';
import ThreadPool from '@lib/std/ThreadPool';

const modem = asComponent(component.getPrimary('modem'));

const transport = new Transport(modem.address, {
	debug: {
		logging: true,
	},
});

const dataProvider = new InMemoryDataProvider({
	'foo': 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer volutpat sed magna non venenatis.',
	'bar': 'Aliquam erat volutpat. Etiam mauris libero, feugiat a felis in, elementum semper mauris.' +
		' Duis efficitur purus magna, sit amet ullamcorper erat congue non. Nunc porta diam sed tortor efficitur feugiat. Quisque commodo laoreet arcu.',
});

const server = new RadpServer(
	transport,
	ThreadPool.default(),
	dataProvider,
	{
		controlPort: 24,
		heartbeat: 0.5,
		tcpPort: 26,
		tcpOptions: {
			packetSize: 256,
			packetRetryCount: 3,
			finalizeRetryCount: 10,
		},
	});

let shutdown = false;

const callback = () => {
	print('Interrupted.');
	shutdown = true;
};

event.listen('interrupted', callback);

print('Server started on port 24/26');

server.start({
	onHeartbeat: ctl => {
		if (shutdown) ctl.shutdown();
	},
	onRequest: (_, sender, req) => {
		print(`from ${sender}: GET ${req.body}`);
	},
});

event.ignore('interrupted', callback);