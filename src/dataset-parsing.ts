import * as Either from "effect/Either";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import { DatasetDefinitionSchema, type DatasetDefinition } from "./dataset-definition";

const decodeDatasetDefinitionFromJson = Schema.decodeUnknownEither(Schema.parseJson(DatasetDefinitionSchema));

export const parseDatasetDefinition = (jsonText: string): DatasetDefinition => {
  const decoded = decodeDatasetDefinitionFromJson(jsonText);
  if (Either.isLeft(decoded)) {
    throw new Error(ParseResult.TreeFormatter.formatErrorSync(decoded.left));
  }
  return decoded.right;
};
