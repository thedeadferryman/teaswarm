import { isString } from '@lib/util';

export type OCEventPullResult<T extends OC.EventType> = LuaMultiReturn<[T, ...OC.EventMap[T]]>;
export type CustomEventPullResult = LuaMultiReturn<[string, ...unknown[]]>;
export type EventPullResult<T extends string> =
	(T extends OC.EventType ? OCEventPullResult<T> : CustomEventPullResult);


export const TaskStates = ['new', 'running', 'ill', 'finished'] as const;
export type TaskState = typeof TaskStates[number];

export const isTaskState = (value: unknown): value is TaskState => (
	isString(value)
	&& TaskStates.includes(value as TaskState)
);


export const TaskMessageTypes = ['pullFiltered', 'waitFor'] as const;
export type TaskMessageType = typeof TaskMessageTypes[number];

export const isTaskMessageType = (value: unknown): value is TaskMessageType => (
	isString(value) && TaskMessageTypes.includes(value as TaskMessageType)
);
