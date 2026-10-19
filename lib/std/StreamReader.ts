export interface StreamReader {
	read: (size: number) => string;
	eof: () => boolean;
}

export class StringReader implements StreamReader {
	private caret: number;

	constructor(private data: string) {
		this.caret = 0;
	}

	read(size: number) {
		const caretNext = math.min(this.caret + size, this.data.length);

		const buf = this.data.substring(this.caret, caretNext);

		this.caret = caretNext;

		return buf;
	}

	eof() {
		return this.caret >= this.data.length;
	}
}

export const consumeStream = (reader: StreamReader, bufferSize: number, cb: (buffer: string) => unknown) => {
	while (true) {
		if (reader.eof()) return;

		cb(reader.read(bufferSize));
	}
};