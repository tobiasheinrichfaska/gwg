import { DEFAULT_RULES, type Mandate } from '../src/logic/index.ts';

export function mandate(over: Partial<Mandate> = {}): Mandate {
  return {
    id: '10001',
    name: 'Muster GmbH',
    legalForm: 'gmbh',
    active: true,
    idStatus: 'vollstaendig',
    riskGroupId: 'M-01',
    riskReason: '',
    isPep: false,
    firstRequestOn: null,
    lastCheckOn: '2026-01-15',
    endedOn: null,
    ...over,
  };
}

export const rules = DEFAULT_RULES;
