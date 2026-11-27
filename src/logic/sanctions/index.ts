export { normalizeName } from './normalize.ts';
export { levenshtein, nameSimilarity } from './similarity.ts';
export {
  classifyEntry,
  classifyMatch,
  classifyNames,
  type EntryMatch,
  type PartialDate,
} from './classify.ts';
export {
  isListBirth,
  LIST_FORMAT,
  LIST_VERSION,
  MAX_ENTRIES,
  MAX_NAMES,
  parseIndex,
  serializeIndex,
  type ListEntry,
  type ListIndex,
  type ListKind,
} from './list.ts';
export { screenAll, screenPerson, type Hit, type Unscreenable } from './screening.ts';
