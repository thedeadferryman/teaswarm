import * as component from 'component';
import * as event from 'event';

const modem = component.getPrimary('modem');

modem.open(27);

while (true) {
	const [type, _, sender, port, __, ...data] = event.pull(2, 'modem_message');

	if (type !== 'modem_message') continue;

	if (port === 27 && data[0] === 'HELO') {
		print(sender);
		break;
	}
}