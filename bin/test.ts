import { asComponent } from '@lib/util';
import * as component from 'component';
import Transport from '@lib/net/transport';
import Transmission from '@lib/net/tcp/transmission';
import { StringReader } from '@lib/std/StreamReader';

const main = async () => {
	const destAddr = 'cc2dbcf8-abe7-4e6f-b5f9-1d4337ca24b4';

	const modem = asComponent(component.getPrimary('modem'));

	const transport = new Transport(modem.address);

	const txm = new Transmission(transport, { addr: destAddr, port: 27 }, 27, {
		packetSize: 4,
		packetRetryCount: 3,
		timeout: 2,
		closureTimeout: 10,
	});

	print('TXM created');

	const stream = new StringReader('Lorem ipsum un dolor sit amet');

	txm.write(stream);

	print('TXM written');

	await txm.execute();

	print('TXM executed');
};
print('Before start');
main()
	.catch(e => print('ERROR HERE FUCKS ME', e))
	.finally(() => {
});