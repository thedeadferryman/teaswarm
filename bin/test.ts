import * as uuid from 'uuid';
import { packAddr } from '@lib/util';

const uid = uuid.next();

const cuid = packAddr(uid);

print(cuid, cuid.length);