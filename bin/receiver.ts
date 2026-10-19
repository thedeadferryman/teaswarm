import { asComponent } from '@lib/util';
import * as component from 'component';
import Transport from '@lib/net/transport';
import Receptionist from '@lib/net/tcp/receptionist';

const modem = asComponent(component.getPrimary('modem'));

const transport = new Transport(modem.address, {});

const server = new Receptionist(transport, 27, 0.5);

print('Started server on port 27');

server.listen((peer, data) => {
	print(`From ${peer.addr}:${peer.port}: `, data);
});