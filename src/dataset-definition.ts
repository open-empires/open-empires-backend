import * as JSONSchema from "effect/JSONSchema";
import * as Schema from "effect/Schema";

export const DATASET_JSON_SCHEMA_ID = "https://open-empires.dev/schemas/dataset.schema.json";
const JSON_SCHEMA_DRAFT_2020 = "https://json-schema.org/draft/2020-12/schema";
const U8 = Schema.Int.pipe(Schema.between(0, 255));
const U32 = Schema.Int.pipe(Schema.between(0, 4_294_967_295));
const U64 = Schema.Int.pipe(Schema.between(0, Number.MAX_SAFE_INTEGER));
const PositiveU32 = U32.pipe(Schema.greaterThan(0));
const PositiveU64 = U64.pipe(Schema.greaterThan(0));
const Code = Schema.NonEmptyTrimmedString;
const NonEmptyText = Schema.NonEmptyTrimmedString;

const IconsSchema = Schema.Struct({
  techTreeIconSpritePath: Schema.String,
  chatIconSpritePath: Schema.String,
  diplomacyIconSpritePath: Schema.String,
  settingsIconSpritePath: Schema.String,
  standardCursorSpritePath: Schema.String,
  goToLocationSpritePath: Schema.String
});

const DirectionalSpritePathSchema = Schema.Struct({
  code: Code,
  leftSpritePath: Schema.String,
  leftUpSpritePath: Schema.String,
  upSpritePath: Schema.String,
  rightUpSpritePath: Schema.String,
  rightSpritePath: Schema.String,
  rightDownSpritePath: Schema.String,
  downSpritePath: Schema.String,
  leftDownSpritePath: Schema.String
});

const UnitCategorySchema = Schema.Struct({
  code: Code,
  name: NonEmptyText
});

const UnitPropertySchema = Schema.Struct({
  code: Code,
  name: NonEmptyText
});

const TerrainSchema = Schema.Struct({
  code: Code,
  name: NonEmptyText,
  spritePath: Schema.String
});

const TerrainWalkableUnitCategorySchema = Schema.Struct({
  terrainCode: Code,
  unitCategoryCode: Code
});

const ResourceSchema = Schema.Struct({
  code: Code,
  name: NonEmptyText,
  iconSpritePath: Schema.String
});

const UnitSchema = Schema.Struct({
  code: Code,
  unitCategoryCode: Code,
  iconSpritePath: Schema.String,
  length: PositiveU64,
  height: PositiveU64,
  name: NonEmptyText,
  selectSoundPath: Schema.String,
  selectable: Schema.Boolean,
  deathByUnitPropertyCode: Schema.optional(Code),
  walkable: Schema.Boolean,
  blockable: Schema.Boolean,
  hoverHeight: Schema.optionalWith(U64, { default: () => 0 }),
  ascentAcceleration: Schema.optionalWith(U64, { default: () => 0 }),
  descentAcceleration: Schema.optionalWith(U64, { default: () => 0 }),
  ascentStartSpeed: Schema.optionalWith(U64, { default: () => 0 }),
  descentStartSpeed: Schema.optionalWith(U64, { default: () => 0 }),
  deathByZero: Schema.Boolean,
  tiled: Schema.Boolean
});

const BaseUnitPropertySchema = Schema.Struct({
  unitCode: Code,
  unitPropertyCode: Code,
  value: U32
});

const ActionSchema = Schema.Struct({
  code: Code,
  sourceUnitCode: Code,
  targetUnitCategoryCodes: Schema.optionalWith(Schema.Array(Code), { default: () => [] }),
  taskSoundPath: Schema.optionalWith(Schema.String, { default: () => "" }),
  activeSoundPath: Schema.optionalWith(Schema.String, { default: () => "" }),
  cursorSpritePath: Schema.optionalWith(Schema.String, { default: () => "" }),
  repeats: Schema.Boolean,
  missChance: Schema.optionalWith(U32, { default: () => 0 }),
  speedUnitPropertyCode: Schema.optional(Code),
  minimumRangeUnitPropertyCode: Schema.optional(Code),
  maximumRangeUnitPropertyCode: Schema.optional(Code),
  rechargeTime: Schema.optionalWith(U32, { default: () => 0 }),
  name: NonEmptyText
});

const ActionEffectSchema = Schema.Struct({
  actionCode: Code,
  splashRadius: Schema.optionalWith(U64, { default: () => 0 }),
  friendlyFire: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  impactsOthers: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  sourceGarrisons: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  targetGarrisons: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  sourceUngarrisons: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  targetUngarrisons: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  sourceUnitPropertyCode: Schema.optional(Code),
  targetUnitPropertyCode: Schema.optional(Code),
  targetUnitPropertyDirection: Schema.optionalWith(Schema.Literal("add", "sub", "set"), { default: () => "sub" }),
  targetDefensePropertyCode: Schema.optional(Code),
  targetConverts: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  spawnProjectileUnitCode: Schema.optional(Code)
});

const ActionSpriteSchema = Schema.Struct({
  actionCode: Code,
  unitPropertyCode: Code,
  unitPropertyValueBelowOrEq: Schema.optional(U32),
  unitPropertyValueAboveOrEq: Schema.optional(U32),
  directionalSpritePathCode: Code
});

const UnitDeathProgressionSchema = Schema.Struct({
  sourceActionCode: Schema.optional(Code),
  replaceWithUnitCode: Code
});

const TerrainDominanceOrderSchema = Schema.Struct({
  terrainCode: Code,
  dominanceOrder: U32
});

const TerrainTransitionVariantSchema = Schema.Struct({
  recessiveTerrainCode: Code,
  dominantTerrainCode: Code,
  edgeMask: U8,
  terrainVariant: U8
});

const MapTerrainWeightSchema = Schema.Struct({
  terrainCode: Code,
  weight: PositiveU32,
  isWater: Schema.optionalWith(Schema.Boolean, { default: () => false })
});

const MapSpawnUnitSchema = Schema.Struct({
  unitCode: Code,
  count: PositiveU32,
  radius: U64,
  nature: Schema.optionalWith(Schema.Boolean, { default: () => false })
});

const MapSchema = Schema.Struct({
  code: Code,
  name: NonEmptyText,
  width: PositiveU64,
  height: PositiveU64,
  empireLimit: PositiveU32,
  terrainSeed: Schema.optionalWith(U64, { default: () => 1 }),
  terrainWeights: Schema.optionalWith(Schema.Array(MapTerrainWeightSchema), { default: () => [] }),
  spawnUnits: Schema.optionalWith(Schema.Array(MapSpawnUnitSchema), { default: () => [] })
});

export const DatasetDefinitionSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  icons: IconsSchema,
  directionalSpritePaths: Schema.optionalWith(Schema.Array(DirectionalSpritePathSchema), { default: () => [] }),
  unitCategories: Schema.optionalWith(Schema.Array(UnitCategorySchema), { default: () => [] }),
  unitProperties: Schema.optionalWith(Schema.Array(UnitPropertySchema), { default: () => [] }),
  terrain: Schema.optionalWith(Schema.Array(TerrainSchema), { default: () => [] }),
  terrainWalkableUnitCategories: Schema.optionalWith(Schema.Array(TerrainWalkableUnitCategorySchema), { default: () => [] }),
  resources: Schema.optionalWith(Schema.Array(ResourceSchema), { default: () => [] }),
  units: Schema.optionalWith(Schema.Array(UnitSchema), { default: () => [] }),
  baseUnitProperties: Schema.optionalWith(Schema.Array(BaseUnitPropertySchema), { default: () => [] }),
  actions: Schema.optionalWith(Schema.Array(ActionSchema), { default: () => [] }),
  actionEffects: Schema.optionalWith(Schema.Array(ActionEffectSchema), { default: () => [] }),
  actionSprites: Schema.optionalWith(Schema.Array(ActionSpriteSchema), { default: () => [] }),
  unitDeathProgressions: Schema.optionalWith(Schema.Array(UnitDeathProgressionSchema), { default: () => [] }),
  maps: Schema.optionalWith(Schema.Array(MapSchema), { default: () => [] }),
  terrainDominanceOrders: Schema.optionalWith(Schema.Array(TerrainDominanceOrderSchema), { default: () => [] }),
  terrainTransitionVariants: Schema.optionalWith(Schema.Array(TerrainTransitionVariantSchema), { default: () => [] })
}).annotations({
  identifier: "OpenEmpiresDatasetDefinition",
  title: "Open Empires Dataset Definition",
  description: "Source-of-truth dataset definition used to normalize all datasetId-backed metadata tables.",
  jsonSchema: { $id: DATASET_JSON_SCHEMA_ID }
});

export type DatasetDefinition = Schema.Schema.Type<typeof DatasetDefinitionSchema>;

export const DatasetDefinitionJsonSchema = (() => {
  const schema = JSONSchema.make(DatasetDefinitionSchema, { target: "jsonSchema2020-12" });
  return {
    ...schema,
    $id: DATASET_JSON_SCHEMA_ID,
    $schema: JSON_SCHEMA_DRAFT_2020
  };
})();
