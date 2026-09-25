import type { CaseTemplate } from '../gen/case_api';
import { POWER } from './power';
import { O2DRAIN } from './o2drain';
import { PRESSURE } from './pressure';
import { FOOD } from './food';
import { NAVTAMPER } from './navtamper';
import { PAINKILLER } from './painkiller';
import { FALSEFIRE } from './falsefire';
import { DISTRESS } from './distress';
import { SEU } from './seu';
import { DUST } from './dust';
import { H2S } from './h2s';
import { CREAK } from './creak';

export const TEMPLATES: CaseTemplate[] = [POWER, O2DRAIN, PRESSURE, FOOD, NAVTAMPER, PAINKILLER, FALSEFIRE, DISTRESS, SEU, DUST, H2S, CREAK];
