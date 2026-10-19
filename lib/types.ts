export type Addr = string;

export type Component = {
	address: Addr;
}

export type EventArgs<T extends OC.EventType> = [string, ...OC.EventMap[T]];
export type EventListener<T extends OC.EventType, R> = (...args: EventArgs<T>) => R;