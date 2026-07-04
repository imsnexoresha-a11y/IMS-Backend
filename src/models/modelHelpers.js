import { randomUUID } from 'crypto';

export const uuidId = {
  type: String,
  default: () => randomUUID(),
};

export const schemaOptions = {
  versionKey: false,
  id: false,
};