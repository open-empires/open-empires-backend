import { SenderError, schema, table, t } from "spacetimedb/server";
import { DATASET_JSON_SCHEMA_ID } from "./dataset-definition";
import { parseDatasetDefinition } from "./dataset-parsing";
import { clampInt, clampU32, toSafeNumber, toU32, toU64, toU8 } from "./number-utils";
import { ACTION_QUEUE_HEAD_SENTINEL, findQueueHeadNode, findQueueNextNode, findQueueTailNode } from "./queue-ops";

function primaryKey() {
  return t.u64().primaryKey().autoInc();
}

function foreignKey() {
  return t.u64().index();
}

function position() {
  return t.u64();
}

function frame() {
  return t.u16();
}

function stat() {
  return t.u32();
}

function tickDuration() {
  return t.u64();
}

const spacetimedb = schema({
  users: table(
    { name: "users", public: true },
    {
      id: primaryKey(),
      createdAt: t.timestamp(),
      identity: t.identity().unique(),
      discordId: t.option(t.string()),
      // TODO: preferences including hotkeys
      prefersDarkMode: t.bool(),
      gridColor: t.string()
    },
  ),
  // TODO: maybe have all users get a "mod" by default so they can customize things.
  // PERSISTENT WORLD
  mapInstances: table(
    { name: "map_instances", public: true },
    {
      id: primaryKey(),
      createdAt: t.timestamp(),
      datasetId: foreignKey(),
      mapId: foreignKey(),
      // Long-term the goal is to get this to 500
      empireLimit: stat(),
      width: position(),
      height: position(),
      tick: tickDuration(),
      seed: t.u64(),
    },
  ),
  terrainPlacements: table(
    { name: "terrain_placements", public: true },
    {
      id: primaryKey(),
      mapInstanceId: foreignKey(),
      x: position(),
      y: position(),
      terrainId: foreignKey(),
    }
  ),
  empires: table(
    { name: "empires", public: true },
    {
      id: primaryKey(),
      mapInstanceId: foreignKey(),
      name: t.string(),
      civilizationId: foreignKey(),
      // An empire's stockpile is actually a unit.
      // The unit has resource stats and perhaps handicap multipliers.
      // 0 means "not provisioned yet".
      stockpileUnitInstanceId: foreignKey()
    }
  ),
  // co-op support by making user to empire many to many
  players: table(
    { name: "players", public: true},
    {
      id: primaryKey(),
      createdAt: t.timestamp(),
      updatedAt: t.timestamp(),
      // Player can only join other empires if they are not currently
      // part of one
      active: t.bool(),
      empireId: foreignKey(),
      userId: foreignKey()
    }
  ),
  empireSpawnCenters: table(
    { name: "empire_spawn_centers", public: true },
    {
      id: primaryKey(),
      mapInstanceId: foreignKey(),
      empireId: foreignKey(),
      x: position(),
      y: position()
    }
  ),
  unitInstances: table(
    { name: "unit_instances", public: true },
    {
      id: primaryKey(),
      createdAt: t.timestamp(),
      mapInstanceId: foreignKey(),
      empireId: foreignKey(),
      unitId: foreignKey(),
      x: position(),
      y: position(),
      height: position(), // for units which ascend and descend
      verticalSpeed: position(),
      facingDirection: t.enum("Direction", ["left", "leftUp", "up", "rightUp", "right", "rightDown", "down", "leftDown"]),
      // For units created by this unit. If unset spawn and ungarrison happens next to host unit
      gatherX: t.option(position()),
      gatherY: t.option(position())
    },
  ),
  unitPropertyInstances: table(
    { name: "unit_property_instances", public: true },
    {
      id: primaryKey(),
      unitInstanceId: foreignKey(),
      unitPropertyId: foreignKey(),
      // Controls max garrison, heal limit, max resources, etc.
      maxValue: stat(),
      value: stat()
    }
  ),
  unitGarrisons: table(
    { name: "unit_garrisons", public: true },
    {
      id: primaryKey(),
      mapInstanceId: foreignKey(),
      hostUnitInstanceId: foreignKey(),
      garrisonedUnitInstanceId: foreignKey().unique()
    }
  ),
  // Moving to locations, completing tasks.
  // Game engine is in charge of adding new movement nodes
  // For cases where unit needs to travel before task is possible.
  actionSequenceNodes: table(
    {name: "action_sequence_nodes", public: true},
    {
      id: primaryKey(),
      createdAt: t.timestamp(),
      unitInstanceId: foreignKey(),
      // When 0, it's the current action
      priorActionSequenceNodeId: foreignKey(),
      actionId: foreignKey(),
      // When 0, the unit is doing a movement-type action.
      targetUnitInstanceId: t.u64().index(),
      destinationX: t.u64(),
      destinationY: t.u64(),
      // If it's a pre-action move, game engine knows to adjust the destination
      // as the target moves, also flags for action steps only show for 
      // non pre-action moves.
      preActionMove: t.bool()
    }
  ),
  // We need to model things like a monk recharging for a conversion while also
  // moving.  
  passiveActions: table(
    {name: "passive_actions", public: true},
    {
      id: primaryKey(),
      createdAt: t.timestamp(),
      unitInstanceId: foreignKey(),
      actionId: foreignKey()
    }
  ),
  // TODO: active technologies
  // METADATA
  datasets: table(
    { name: "datasets", public: true },
    {
      id: primaryKey(),
      createdAt: t.timestamp(),
      // General icons
      techTreeIconSpritePath: t.string(),
      chatIconSpritePath: t.string(),
      diplomacyIconSpritePath: t.string(),
      settingsIconSpritePath: t.string(),
      // Game interaction sprites
      standardCursorSpritePath: t.string(),
      goToLocationSpritePath: t.string(),
    },
  ),
  maps: table(
    {name: "maps", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      code: t.string(),
      name: t.string(),
      width: t.u64(),
      height: t.u64(),
      empireLimit: t.u32(),
      terrainSeed: t.u64()
    }
  ),
  // For now any new empire will just spawn some standard number of units.
  // In the future we might calculate a reasonable amount to spawn with given a late join.
  mapSpawnUnits: table(
    {name: "map_spawn_units", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      mapId: t.u64().index(),
      unitId: t.u64().index(),
      count: t.u32(),
      radius: t.u64(),
      nature: t.bool()
    }
  ),
  mapTerrainWeights: table(
    {name: "map_terrain_weights", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      mapId: t.u64().index(),
      terrainId: t.u64().index(),
      weight: t.u32(),
      isWater: t.bool()
    }
  ),
  directionalAnimations: table(
    {name: "directional_animations", public: true},
    {
      id: primaryKey(),
      datasetId: foreignKey(),

      leftSpriteId: foreignKey(),
      leftSpriteStartFrame: frame(),
      leftSpriteEndFrame: frame(),
      leftDuration: tickDuration(),

      leftUpSpriteId: foreignKey(),
      leftUpSpriteStartFrame: frame(),
      leftUpSpriteEndFrame: frame(),
      leftUpDuration: tickDuration(),

      upSpriteId: foreignKey(),
      upSpriteStartFrame: frame(),
      upSpriteEndFrame: frame(),
      upDuration: tickDuration(),
      
      rightUpSpriteId: foreignKey(),
      rightUpStartFrame: frame(),
      rightUpEndFrame: frame(),
      rightUpDuration: tickDuration(),

      rightSpriteId: foreignKey(),
      rightSpriteStartFrame: frame(),
      rightSpriteEndFrame: frame(),
      rightDuration: tickDuration(),
      
      rightDownSpritePath: t.string(),

      
      downSpritePath: t.string(),
      
      leftDownSpritePath: t.string()
    }
  ),
  animation: table(
    {name: "animations", public: true},
    {
      id: primaryKey(),
      createdAt: t.timestamp(),
      spriteId: foreignKey(),
      startFrame: frame(),
      endFrame: frame(),
      duration: tickDuration()
    }
  ),
  sprites: table(
    {name: "sprites", public: true},
    {
      id: primaryKey(),
      // We cannot host proprietary assets. Some will need to live in local storage
      local: t.bool(),
      totalFrames: frame()
    }
  ),
  unitCategories: table(
    {name: "unit_categories", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      name: t.string()
    }
  ),
  unitProperties: table(
    {name: "unit_properties", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      name: t.string(),
    }
  ),
  terrains: table(
    {name: "terrains", public: true},
    {
      id: primaryKey(),
      datasetId: foreignKey(),
      spritePath: t.string(),
      name: t.string()
    }
  ),
  terrainBorders: table(
    {name: "terrain_boarders", public: true},
    {
      id: primaryKey(),
      datasetId: foreignKey(),
      primaryTerrainId: foreignKey(),
      secondaryTerrainId: foreignKey(),
      
    }
  ),
  terrainWalkableUnitCategories: table(
    {name: "terrain_walkable_unit_categories", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      terrainId: t.u64().index(),
      unitCategoryId: t.u64().index(),
    }
  ),
  resources: table(
    { name: "resources", public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      name: t.string(),
      iconSpritePath: t.string()
    }
  ),
  units: table(
    { name: "units", public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      unitCategoryId: t.u64().index(),
      iconSpritePath: t.string(),
      length: t.u64(),
      width: t.u64(),
      name: t.string(),
      selectSoundPath: t.string(),
      selectable: t.bool(),
      deathByUnitPropertyId: t.u64().index(),
      walkable: t.bool(),
      // Arrows and bullets cannot be obstructed
      blockable: t.bool(),
      // For perpetually hovering things like birds or planes or arcing projectiles
      hoverHeight: t.u64(),
      ascentAcceleration: t.u64(),
      descentAcceleration: t.u64(),
      ascentStartSpeed: t.u64(),
      descentStartSpeed: t.u64(),
      // Most things "die" by hitting 0, except foundations which die at hp capacity
      deathByZero: t.bool(),
      tiled: t.bool(),
    },
  ),
  unitDeathProgressions: table(
    { name: "unit_death_progressions", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      // 0 means this progression applies to any source action.
      sourceActionId: t.u64().index(),
      // Example 1: Hunt action causes boar to become downed boar whereas normal attack 
      //            causes boar to directly become carcass.
      // Example 2: Chop action causes tree to become downed tree whereas onager shot
      //            cases tree to directly become stump.
      replaceWithUnitId: t.u64().index(),
    }
  ),
  baseUnitProperties: table(
    { name: "base_unit_properties", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      unitId: t.u64().index(),
      unitPropertyId: t.u64().index(),
      value: t.u32()
    }
  ),
  actions: table(
    { name: "actions", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      sourceUnitId: t.u64().index(),
      targetUnitCategoryIds: t.array(t.u64()),
      taskSoundPath: t.string(),
      activeSoundPath: t.string(),
      cursorSpritePath: t.string(),
      // Garrisons and conversions are not repeatable for example
      repeats: t.bool(),
      // Used for conversions taking some amount of time or arrows missing
      missChance: t.u32().index(),
      speedUnitPropertyId: t.u64().index(),
      minimumRangeUnitPropertyId: t.u64().index(),
      maximumRangeUnitPropertyId: t.u64().index(),
      // Conversions and charge take time before they can be repeated
      rechargeTime: t.u32(),
      name: t.string(),
    }
  ),
  actionEffects: table(
    {name: "action_effects", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      actionId: t.u64().index(),
      splashRadius: t.u64(),
      friendlyFire: t.bool(),
      impactsOthers: t.bool(),
      sourceGarrisons: t.bool(),
      targetGarrisons: t.bool(),
      sourceUngarrisons: t.bool(),
      targetUngarrisons: t.bool(),
      sourceUnitPropertyId: t.u64().index(),
      targetUnitPropertyId: t.u64().index(),
      targetUnitPropertyDirection: t.enum("PropertyDeltaDirection", ["add", "sub", "set"]),
      targetDefensePropertyId: t.u64().index(),
      targetConverts: t.bool(),
      spawnProjectileUnitId: t.u64().index(),
    }
  ),
  actionSprites: table(
    {name: "action_sprites", public: true},
    {
      id: t.u64().primaryKey().autoInc(),
      datasetId: t.u64().index(),
      actionId: t.u64().index(),
      unitPropertyId: t.u64().index(),
      unitPropertyValueBelowOrEq: t.option(t.u32()),
      unitPropertyValueAboveOrEq: t.option(t.u32()),
      directionalSpritePathId: t.u64().index()
    }
  )
});

export default spacetimedb;
const AUTO_INC_ID = 0n;
const NO_UNIT_SENTINEL = 0n;
const NO_EMPIRE_SENTINEL = 0n;
const NO_PROPERTY_SENTINEL = 0n;
const ANY_ACTION_SENTINEL = 0n;
const U64_MASK = (1n << 64n) - 1n;
const EDGE_NORTH_BIT = 1;
const EDGE_EAST_BIT = 2;
const EDGE_SOUTH_BIT = 4;
const EDGE_WEST_BIT = 8;
const DEFAULT_MAP_MIN_EDGE = 16;
const DEFAULT_MAP_MAX_EDGE = 512;

const tileKey = (x: bigint, y: bigint): string => `${x},${y}`;

const mixU64 = (value: bigint): bigint => {
  let z = (value + 0x9e3779b97f4a7c15n) & U64_MASK;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & U64_MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & U64_MASK;
  return z ^ (z >> 31n);
};

const hash01 = (seed: bigint, x: bigint, y: bigint, salt: bigint): number => {
  const combined = seed
    ^ (x * 0x9e3779b97f4a7c15n)
    ^ (y * 0xc2b2ae3d27d4eb4fn)
    ^ salt;
  const mixed = mixU64(combined) & 0xffffffffn;
  return Number(mixed) / 4294967296;
};

const chooseWeightedTerrain = <TRow extends { terrainId: bigint; weight: number }>(rows: TRow[], sample: number): bigint | undefined => {
  let totalWeight = 0;
  for (const row of rows) {
    totalWeight += row.weight;
  }
  if (totalWeight <= 0) {
    return undefined;
  }

  const threshold = sample * totalWeight;
  let running = 0;
  for (const row of rows) {
    running += row.weight;
    if (threshold <= running) {
      return row.terrainId;
    }
  }

  return rows[rows.length - 1]?.terrainId;
};

const findOpenTileAroundCenter = (
  seed: bigint,
  centerX: number,
  centerY: number,
  radius: number,
  width: number,
  height: number,
  occupiedTiles: Set<string>,
  salt: bigint,
): { x: bigint; y: bigint } | undefined => {
  if (width <= 0 || height <= 0) {
    return undefined;
  }

  const clampedRadius = Math.max(0, radius);
  for (let attempt = 0; attempt < 256; attempt += 1) {
    const angle = hash01(seed, salt, BigInt(attempt), 0x1001n) * Math.PI * 2;
    const distance = clampedRadius === 0
      ? 0
      : Math.floor(hash01(seed, salt, BigInt(attempt), 0x1003n) * (clampedRadius + 1));

    const x = clampInt(centerX + Math.round(Math.cos(angle) * distance), 0, width - 1);
    const y = clampInt(centerY + Math.round(Math.sin(angle) * distance), 0, height - 1);
    const key = tileKey(BigInt(x), BigInt(y));
    if (occupiedTiles.has(key)) {
      continue;
    }

    return { x: BigInt(x), y: BigInt(y) };
  }

  return undefined;
};

export const init = spacetimedb.init({ name: "init" }, (_ctx) => {
  // Called when the module is initially published
});

export const onConnect = spacetimedb.clientConnected({ name: "on_connect" }, (ctx) => {
  const existingUser = ctx.db.users.identity.find(ctx.sender);
  if (existingUser) {
    return;
  }
  ctx.db.users.insert({
    id: AUTO_INC_ID,
    identity: ctx.sender,
    discordId: undefined,
    createdAt: ctx.timestamp,
    // TODO: get from context
    prefersDarkMode: true,
    gridColor: "#000000"
  });
});

export const onDisconnect = spacetimedb.clientDisconnected({ name: "on_disconnect" }, (_ctx) => {
  // Called every time a client disconnects
});

export const ingestDataset = spacetimedb.procedure(
  { name: "add" },
  { packageName: t.string(), packageVersion: t.string() },
  t.object("IngestDatasetResult", {
    datasetId: t.u64(),
    created: t.bool(),
    fetchedDatasetJson: t.bool()
  }),
  (ctx, { packageName, packageVersion }) => {
    const trimmedPackageName = packageName.trim();
    const trimmedPackageVersion = packageVersion.trim();
    if (trimmedPackageName.length === 0) {
      throw new SenderError("packageName is required.");
    }
    if (trimmedPackageVersion.length === 0) {
      throw new SenderError("packageVersion is required.");
    }

    const response = ctx.http.fetch(`https://unpkg.com/${trimmedPackageName}@${trimmedPackageVersion}/dataset.json`);
    if (!response.ok) {
      throw new SenderError(`Unable to fetch dataset.json for ${trimmedPackageName}@${trimmedPackageVersion}.`);
    }

    const datasetJsonText = response.text();
    let datasetDefinition;
    try {
      datasetDefinition = parseDatasetDefinition(datasetJsonText);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new SenderError(`dataset.json failed schema validation (${DATASET_JSON_SCHEMA_ID}): ${detail}`);
    }

    if (
      datasetDefinition.$schema !== undefined
      && datasetDefinition.$schema !== DATASET_JSON_SCHEMA_ID
    ) {
      throw new SenderError(`dataset.json $schema must be "${DATASET_JSON_SCHEMA_ID}".`);
    }

    return ctx.withTx((tx) => {
      for (const existingDataset of tx.db.datasets.iter()) {
        if (
          existingDataset.packageName === trimmedPackageName
          && existingDataset.packageVersion === trimmedPackageVersion
        ) {
          return {
            datasetId: existingDataset.id,
            created: false,
            fetchedDatasetJson: true
          };
        }
      }

      const createdDataset = tx.db.datasets.insert({
        id: AUTO_INC_ID,
        createdAt: tx.timestamp,
        packageName: trimmedPackageName,
        packageVersion: trimmedPackageVersion,
        techTreeIconSpritePath: datasetDefinition.icons.techTreeIconSpritePath,
        chatIconSpritePath: datasetDefinition.icons.chatIconSpritePath,
        diplomacyIconSpritePath: datasetDefinition.icons.diplomacyIconSpritePath,
        settingsIconSpritePath: datasetDefinition.icons.settingsIconSpritePath,
        standardCursorSpritePath: datasetDefinition.icons.standardCursorSpritePath,
        goToLocationSpritePath: datasetDefinition.icons.goToLocationSpritePath
      });

      const datasetId = createdDataset.id;
      const ensureUniqueCode = (store: Map<string, bigint>, code: string, label: string): void => {
        if (store.has(code)) {
          throw new SenderError(`Duplicate ${label} code "${code}" in dataset.json.`);
        }
      };
      const resolveCode = (store: Map<string, bigint>, code: string, label: string): bigint => {
        const id = store.get(code);
        if (id === undefined) {
          throw new SenderError(`Unknown ${label} code "${code}" in dataset.json.`);
        }
        return id;
      };

      const directionalSpritePathIdByCode = new Map<string, bigint>();
      for (const directionalSpritePath of datasetDefinition.directionalSpritePaths) {
        ensureUniqueCode(directionalSpritePathIdByCode, directionalSpritePath.code, "directionalSpritePath");
        const inserted = tx.db.directionalSpritePaths.insert({
          id: AUTO_INC_ID,
          datasetId,
          leftSpritePath: directionalSpritePath.leftSpritePath,
          leftUpSpritePath: directionalSpritePath.leftUpSpritePath,
          upSpritePath: directionalSpritePath.upSpritePath,
          rightUpSpritePath: directionalSpritePath.rightUpSpritePath,
          rightSpritePath: directionalSpritePath.rightSpritePath,
          rightDownSpritePath: directionalSpritePath.rightDownSpritePath,
          downSpritePath: directionalSpritePath.downSpritePath,
          leftDownSpritePath: directionalSpritePath.leftDownSpritePath
        });
        directionalSpritePathIdByCode.set(directionalSpritePath.code, inserted.id);
      }

      const unitCategoryIdByCode = new Map<string, bigint>();
      for (const unitCategory of datasetDefinition.unitCategories) {
        ensureUniqueCode(unitCategoryIdByCode, unitCategory.code, "unitCategory");
        const inserted = tx.db.unitCategories.insert({
          id: AUTO_INC_ID,
          datasetId,
          name: unitCategory.name
        });
        unitCategoryIdByCode.set(unitCategory.code, inserted.id);
      }

      const unitPropertyIdByCode = new Map<string, bigint>();
      for (const unitProperty of datasetDefinition.unitProperties) {
        ensureUniqueCode(unitPropertyIdByCode, unitProperty.code, "unitProperty");
        const inserted = tx.db.unitProperties.insert({
          id: AUTO_INC_ID,
          datasetId,
          name: unitProperty.name
        });
        unitPropertyIdByCode.set(unitProperty.code, inserted.id);
      }

      const terrainIdByCode = new Map<string, bigint>();
      for (const terrainDefinition of datasetDefinition.terrain) {
        ensureUniqueCode(terrainIdByCode, terrainDefinition.code, "terrain");
        const inserted = tx.db.terrain.insert({
          id: AUTO_INC_ID,
          datasetId,
          spritePath: terrainDefinition.spritePath,
          name: terrainDefinition.name
        });
        terrainIdByCode.set(terrainDefinition.code, inserted.id);
      }

      const resourceIdByCode = new Map<string, bigint>();
      for (const resourceDefinition of datasetDefinition.resources) {
        ensureUniqueCode(resourceIdByCode, resourceDefinition.code, "resource");
        const inserted = tx.db.resources.insert({
          id: AUTO_INC_ID,
          datasetId,
          name: resourceDefinition.name,
          iconSpritePath: resourceDefinition.iconSpritePath
        });
        resourceIdByCode.set(resourceDefinition.code, inserted.id);
      }

      for (const walkable of datasetDefinition.terrainWalkableUnitCategories) {
        tx.db.terrainWalkableUnitCategories.insert({
          id: AUTO_INC_ID,
          datasetId,
          terrainId: resolveCode(terrainIdByCode, walkable.terrainCode, "terrain"),
          unitCategoryId: resolveCode(unitCategoryIdByCode, walkable.unitCategoryCode, "unitCategory")
        });
      }

      const unitIdByCode = new Map<string, bigint>();
      for (const unit of datasetDefinition.units) {
        ensureUniqueCode(unitIdByCode, unit.code, "unit");
        const inserted = tx.db.units.insert({
          id: AUTO_INC_ID,
          datasetId,
          unitCategoryId: resolveCode(unitCategoryIdByCode, unit.unitCategoryCode, "unitCategory"),
          iconSpritePath: unit.iconSpritePath,
          length: toU64(unit.length, `units[${unit.code}].length`),
          height: toU64(unit.height, `units[${unit.code}].height`),
          name: unit.name,
          selectSoundPath: unit.selectSoundPath,
          selectable: unit.selectable,
          deathByUnitPropertyId: unit.deathByUnitPropertyCode
            ? resolveCode(unitPropertyIdByCode, unit.deathByUnitPropertyCode, "unitProperty")
            : NO_PROPERTY_SENTINEL,
          walkable: unit.walkable,
          blockable: unit.blockable,
          hoverHeight: toU64(unit.hoverHeight, `units[${unit.code}].hoverHeight`),
          ascentAcceleration: toU64(unit.ascentAcceleration, `units[${unit.code}].ascentAcceleration`),
          descentAcceleration: toU64(unit.descentAcceleration, `units[${unit.code}].descentAcceleration`),
          ascentStartSpeed: toU64(unit.ascentStartSpeed, `units[${unit.code}].ascentStartSpeed`),
          descentStartSpeed: toU64(unit.descentStartSpeed, `units[${unit.code}].descentStartSpeed`),
          deathByZero: unit.deathByZero,
          tiled: unit.tiled
        });
        unitIdByCode.set(unit.code, inserted.id);
      }

      for (const baseUnitProperty of datasetDefinition.baseUnitProperties) {
        tx.db.baseUnitProperties.insert({
          id: AUTO_INC_ID,
          datasetId,
          unitId: resolveCode(unitIdByCode, baseUnitProperty.unitCode, "unit"),
          unitPropertyId: resolveCode(unitPropertyIdByCode, baseUnitProperty.unitPropertyCode, "unitProperty"),
          value: toU32(baseUnitProperty.value, `baseUnitProperties[${baseUnitProperty.unitCode}].value`)
        });
      }

      const mapIdByCode = new Map<string, bigint>();
      for (const mapDefinition of datasetDefinition.maps) {
        ensureUniqueCode(mapIdByCode, mapDefinition.code, "map");
        const inserted = tx.db.maps.insert({
          id: AUTO_INC_ID,
          datasetId,
          code: mapDefinition.code,
          name: mapDefinition.name,
          width: toU64(mapDefinition.width, `maps[${mapDefinition.code}].width`),
          height: toU64(mapDefinition.height, `maps[${mapDefinition.code}].height`),
          empireLimit: toU32(mapDefinition.empireLimit, `maps[${mapDefinition.code}].empireLimit`),
          terrainSeed: toU64(mapDefinition.terrainSeed, `maps[${mapDefinition.code}].terrainSeed`)
        });
        mapIdByCode.set(mapDefinition.code, inserted.id);
      }

      for (const mapDefinition of datasetDefinition.maps) {
        const mapId = resolveCode(mapIdByCode, mapDefinition.code, "map");
        if (mapDefinition.terrainWeights.length === 0) {
          throw new SenderError(`maps[${mapDefinition.code}] must define at least one terrain weight.`);
        }

        for (const terrainWeight of mapDefinition.terrainWeights) {
          tx.db.mapTerrainWeights.insert({
            id: AUTO_INC_ID,
            datasetId,
            mapId,
            terrainId: resolveCode(terrainIdByCode, terrainWeight.terrainCode, "terrain"),
            weight: toU32(terrainWeight.weight, `maps[${mapDefinition.code}].terrainWeights.weight`),
            isWater: terrainWeight.isWater
          });
        }

        for (const spawnUnit of mapDefinition.spawnUnits) {
          tx.db.mapSpawnUnits.insert({
            id: AUTO_INC_ID,
            datasetId,
            mapId,
            unitId: resolveCode(unitIdByCode, spawnUnit.unitCode, "unit"),
            count: toU32(spawnUnit.count, `maps[${mapDefinition.code}].spawnUnits.count`),
            radius: toU64(spawnUnit.radius, `maps[${mapDefinition.code}].spawnUnits.radius`),
            nature: spawnUnit.nature
          });
        }
      }

      for (const dominanceOrder of datasetDefinition.terrainDominanceOrders) {
        tx.db.terrainDominanceOrders.insert({
          id: AUTO_INC_ID,
          datasetId,
          terrainId: resolveCode(terrainIdByCode, dominanceOrder.terrainCode, "terrain"),
          dominanceOrder: toU32(dominanceOrder.dominanceOrder, `terrainDominanceOrders[${dominanceOrder.terrainCode}]`)
        });
      }

      for (const transitionVariant of datasetDefinition.terrainTransitionVariants) {
        tx.db.terrainTransitionVariants.insert({
          id: AUTO_INC_ID,
          datasetId,
          recessiveTerrainId: resolveCode(terrainIdByCode, transitionVariant.recessiveTerrainCode, "terrain"),
          dominantTerrainId: resolveCode(terrainIdByCode, transitionVariant.dominantTerrainCode, "terrain"),
          edgeMask: toU8(transitionVariant.edgeMask, "terrainTransitionVariants.edgeMask"),
          terrainVariant: toU8(transitionVariant.terrainVariant, "terrainTransitionVariants.terrainVariant")
        });
      }

      const actionIdByCode = new Map<string, bigint>();
      for (const action of datasetDefinition.actions) {
        ensureUniqueCode(actionIdByCode, action.code, "action");
        const targetUnitCategoryIds = action.targetUnitCategoryCodes.map((unitCategoryCode) =>
          resolveCode(unitCategoryIdByCode, unitCategoryCode, "unitCategory")
        );

        const inserted = tx.db.actions.insert({
          id: AUTO_INC_ID,
          datasetId,
          sourceUnitId: resolveCode(unitIdByCode, action.sourceUnitCode, "unit"),
          targetUnitCategoryIds,
          taskSoundPath: action.taskSoundPath,
          activeSoundPath: action.activeSoundPath,
          cursorSpritePath: action.cursorSpritePath,
          repeats: action.repeats,
          missChance: toU32(action.missChance, `actions[${action.code}].missChance`),
          speedUnitPropertyId: action.speedUnitPropertyCode
            ? resolveCode(unitPropertyIdByCode, action.speedUnitPropertyCode, "unitProperty")
            : NO_PROPERTY_SENTINEL,
          minimumRangeUnitPropertyId: action.minimumRangeUnitPropertyCode
            ? resolveCode(unitPropertyIdByCode, action.minimumRangeUnitPropertyCode, "unitProperty")
            : NO_PROPERTY_SENTINEL,
          maximumRangeUnitPropertyId: action.maximumRangeUnitPropertyCode
            ? resolveCode(unitPropertyIdByCode, action.maximumRangeUnitPropertyCode, "unitProperty")
            : NO_PROPERTY_SENTINEL,
          rechargeTime: toU32(action.rechargeTime, `actions[${action.code}].rechargeTime`),
          name: action.name
        });
        actionIdByCode.set(action.code, inserted.id);
      }

      for (const actionEffect of datasetDefinition.actionEffects) {
        tx.db.actionEffects.insert({
          id: AUTO_INC_ID,
          datasetId,
          actionId: resolveCode(actionIdByCode, actionEffect.actionCode, "action"),
          splashRadius: toU64(actionEffect.splashRadius, `actionEffects[${actionEffect.actionCode}].splashRadius`),
          friendlyFire: actionEffect.friendlyFire,
          impactsOthers: actionEffect.impactsOthers,
          sourceGarrisons: actionEffect.sourceGarrisons,
          targetGarrisons: actionEffect.targetGarrisons,
          sourceUngarrisons: actionEffect.sourceUngarrisons,
          targetUngarrisons: actionEffect.targetUngarrisons,
          sourceUnitPropertyId: actionEffect.sourceUnitPropertyCode
            ? resolveCode(unitPropertyIdByCode, actionEffect.sourceUnitPropertyCode, "unitProperty")
            : NO_PROPERTY_SENTINEL,
          targetUnitPropertyId: actionEffect.targetUnitPropertyCode
            ? resolveCode(unitPropertyIdByCode, actionEffect.targetUnitPropertyCode, "unitProperty")
            : NO_PROPERTY_SENTINEL,
          targetUnitPropertyDirection: { tag: actionEffect.targetUnitPropertyDirection },
          targetDefensePropertyId: actionEffect.targetDefensePropertyCode
            ? resolveCode(unitPropertyIdByCode, actionEffect.targetDefensePropertyCode, "unitProperty")
            : NO_PROPERTY_SENTINEL,
          targetConverts: actionEffect.targetConverts,
          spawnProjectileUnitId: actionEffect.spawnProjectileUnitCode
            ? resolveCode(unitIdByCode, actionEffect.spawnProjectileUnitCode, "unit")
            : NO_UNIT_SENTINEL
        });
      }

      for (const actionSprite of datasetDefinition.actionSprites) {
        tx.db.actionSprites.insert({
          id: AUTO_INC_ID,
          datasetId,
          actionId: resolveCode(actionIdByCode, actionSprite.actionCode, "action"),
          unitPropertyId: resolveCode(unitPropertyIdByCode, actionSprite.unitPropertyCode, "unitProperty"),
          unitPropertyValueBelowOrEq: actionSprite.unitPropertyValueBelowOrEq,
          unitPropertyValueAboveOrEq: actionSprite.unitPropertyValueAboveOrEq,
          directionalSpritePathId: resolveCode(
            directionalSpritePathIdByCode,
            actionSprite.directionalSpritePathCode,
            "directionalSpritePath"
          )
        });
      }

      for (const deathProgression of datasetDefinition.unitDeathProgressions) {
        tx.db.unitDeathProgressions.insert({
          id: AUTO_INC_ID,
          datasetId,
          sourceActionId: deathProgression.sourceActionCode
            ? resolveCode(actionIdByCode, deathProgression.sourceActionCode, "action")
            : ANY_ACTION_SENTINEL,
          replaceWithUnitId: resolveCode(unitIdByCode, deathProgression.replaceWithUnitCode, "unit")
        });
      }

      return {
        datasetId,
        created: true,
        fetchedDatasetJson: true
      };
    });
  },
);

export const createMap = spacetimedb.reducer(
  {name: "create_map"},
  {
    mapId: t.u64(),
    width: t.option(t.u64()),
    height: t.option(t.u64()),
    empireLimit: t.option(t.u32()),
    terrainSeed: t.option(t.u64())
  },
  (ctx, props) => {
    const user = ctx.db.users.identity.find(ctx.sender);
    if (!user) {
      throw new SenderError("No user record found for current sender.");
    }

    const mapDefinition = ctx.db.maps.id.find(props.mapId);
    if (!mapDefinition) {
      throw new SenderError("Map definition does not exist.");
    }

    const widthBigInt = props.width ?? mapDefinition.width;
    const heightBigInt = props.height ?? mapDefinition.height;
    const empireLimit = props.empireLimit ?? mapDefinition.empireLimit;
    const terrainSeed = props.terrainSeed ?? mapDefinition.terrainSeed;

    const width = toSafeNumber(widthBigInt, "Map width");
    const height = toSafeNumber(heightBigInt, "Map height");
    if (width < DEFAULT_MAP_MIN_EDGE || height < DEFAULT_MAP_MIN_EDGE) {
      throw new SenderError(`Map dimensions must be at least ${DEFAULT_MAP_MIN_EDGE}.`);
    }
    if (width > DEFAULT_MAP_MAX_EDGE || height > DEFAULT_MAP_MAX_EDGE) {
      throw new SenderError(`Map dimensions must be at most ${DEFAULT_MAP_MAX_EDGE}.`);
    }
    if (empireLimit === 0) {
      throw new SenderError("Empire limit must be greater than 0.");
    }

    const terrainRows = [...ctx.db.terrain.datasetId.filter(mapDefinition.datasetId)];
    if (terrainRows.length === 0) {
      throw new SenderError("Cannot create a map without terrain metadata.");
    }
    terrainRows.sort((left, right) => {
      if (left.id < right.id) {
        return -1;
      }
      if (left.id > right.id) {
        return 1;
      }
      return 0;
    });

    const mapInstance = ctx.db.mapInstances.insert({
      id: AUTO_INC_ID,
      createdAt: ctx.timestamp,
      datasetId: mapDefinition.datasetId,
      mapId: mapDefinition.id,
      empireLimit,
      width: widthBigInt,
      height: heightBigInt,
      terrainSeed
    });

    const configuredTerrainWeights = [...ctx.db.mapTerrainWeights.mapId.filter(mapDefinition.id)];
    if (configuredTerrainWeights.length === 0) {
      throw new SenderError("Map definition has no terrain weights.");
    }
    const mapTerrainWeights = configuredTerrainWeights.map((row) => ({
      terrainId: row.terrainId,
      weight: row.weight,
      isWater: row.isWater
    }));

    const waterTerrainWeights = mapTerrainWeights.filter((row) => row.isWater && row.weight > 0);
    const landTerrainWeights = mapTerrainWeights.filter((row) => !row.isWater && row.weight > 0);
    const fallbackLandTerrainWeights = landTerrainWeights.length > 0
      ? landTerrainWeights
      : mapTerrainWeights;

    const waterTerrainIds = new Set<bigint>();
    for (const row of mapTerrainWeights) {
      if (row.isWater) {
        waterTerrainIds.add(row.terrainId);
      }
    }

    const dominanceRows = [...ctx.db.terrainDominanceOrders.datasetId.filter(mapDefinition.datasetId)];
    const dominanceByTerrain = new Map<bigint, number>();
    for (const terrain of terrainRows) {
      const configuredDominance = dominanceRows.find((row) => row.terrainId === terrain.id);
      dominanceByTerrain.set(
        terrain.id,
        configuredDominance ? configuredDominance.dominanceOrder : terrainRows.findIndex((row) => row.id === terrain.id),
      );
    }

    const transitionVariantByKey = new Map<string, number>();
    for (const transition of ctx.db.terrainTransitionVariants.datasetId.filter(mapDefinition.datasetId)) {
      transitionVariantByKey.set(
        `${transition.recessiveTerrainId}|${transition.dominantTerrainId}|${transition.edgeMask}`,
        transition.terrainVariant,
      );
    }

    const terrainByTile = new Map<string, bigint>();
    const maxEdgeDistance = Math.max(1, Math.floor(Math.min(width, height) / 2));
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const xBig = BigInt(x);
        const yBig = BigInt(y);
        const nearestEdge = Math.min(x, width - 1 - x, y, height - 1 - y);
        const edgeFactor = 1 - (nearestEdge / maxEdgeDistance);

        const waterScore = (edgeFactor * 0.7) + (hash01(terrainSeed, xBig, yBig, 0x2001n) * 0.3);
        const candidateTerrain = (
          waterTerrainWeights.length > 0 && waterScore >= 0.72
        )
          ? chooseWeightedTerrain(waterTerrainWeights, hash01(terrainSeed, xBig, yBig, 0x2003n))
          : chooseWeightedTerrain(fallbackLandTerrainWeights, hash01(terrainSeed, xBig, yBig, 0x2005n));

        const terrainId = candidateTerrain ?? terrainRows[0].id;
        terrainByTile.set(tileKey(xBig, yBig), terrainId);
      }
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const xBig = BigInt(x);
        const yBig = BigInt(y);
        const key = tileKey(xBig, yBig);
        const terrainId = terrainByTile.get(key) ?? terrainRows[0].id;
        const terrainDominance = dominanceByTerrain.get(terrainId) ?? 0;

        let dominantNeighborTerrainId: bigint | undefined = undefined;
        let dominantNeighborOrder = terrainDominance;
        const neighbors = [
          { x: x, y: y - 1, bit: EDGE_NORTH_BIT },
          { x: x + 1, y: y, bit: EDGE_EAST_BIT },
          { x: x, y: y + 1, bit: EDGE_SOUTH_BIT },
          { x: x - 1, y: y, bit: EDGE_WEST_BIT },
        ];

        for (const neighbor of neighbors) {
          if (neighbor.x < 0 || neighbor.x >= width || neighbor.y < 0 || neighbor.y >= height) {
            continue;
          }
          const neighborTerrainId = terrainByTile.get(tileKey(BigInt(neighbor.x), BigInt(neighbor.y)));
          if (neighborTerrainId === undefined) {
            continue;
          }
          const neighborOrder = dominanceByTerrain.get(neighborTerrainId) ?? 0;
          if (neighborOrder > dominantNeighborOrder) {
            dominantNeighborOrder = neighborOrder;
            dominantNeighborTerrainId = neighborTerrainId;
          }
        }

        let edgeMask = 0;
        if (dominantNeighborTerrainId !== undefined) {
          for (const neighbor of neighbors) {
            if (neighbor.x < 0 || neighbor.x >= width || neighbor.y < 0 || neighbor.y >= height) {
              continue;
            }
            const neighborTerrainId = terrainByTile.get(tileKey(BigInt(neighbor.x), BigInt(neighbor.y)));
            if (neighborTerrainId === dominantNeighborTerrainId) {
              edgeMask |= neighbor.bit;
            }
          }
        }

        const terrainVariant = dominantNeighborTerrainId === undefined
          ? 0
          : (
            transitionVariantByKey.get(`${terrainId}|${dominantNeighborTerrainId}|${edgeMask}`)
            ?? edgeMask
          );

        ctx.db.terrainPlacements.insert({
          id: AUTO_INC_ID,
          mapInstanceId: mapInstance.id,
          x: xBig,
          y: yBig,
          terrainId,
          terrainVariant
        });
      }
    }

    const initializeUnitProperties = (unitInstanceId: bigint, unitId: bigint): void => {
      for (const baseProperty of ctx.db.baseUnitProperties.unitId.filter(unitId)) {
        ctx.db.unitPropertyInstances.insert({
          id: AUTO_INC_ID,
          unitInstanceId,
          unitPropertyId: baseProperty.unitPropertyId,
          maxValue: baseProperty.value,
          value: baseProperty.value
        });
      }
    };

    const occupiedTiles = new Set<string>();
    for (const unit of ctx.db.unitInstances.mapInstanceId.filter(mapInstance.id)) {
      occupiedTiles.add(tileKey(unit.x, unit.y));
    }

    const natureSpawnRules = [...ctx.db.mapSpawnUnits.mapId.filter(mapDefinition.id)]
      .filter((rule) => rule.nature);
    natureSpawnRules.sort((left, right) => {
      if (left.id < right.id) {
        return -1;
      }
      if (left.id > right.id) {
        return 1;
      }
      return 0;
    });

    for (const spawnRule of natureSpawnRules) {
      const unitDefinition = ctx.db.units.id.find(spawnRule.unitId);
      if (!unitDefinition) {
        continue;
      }

      const clusterCenterX = Math.floor(hash01(terrainSeed, spawnRule.id, 0n, 0x3001n) * width);
      const clusterCenterY = Math.floor(hash01(terrainSeed, spawnRule.id, 0n, 0x3003n) * height);
      const clusterRadius = toSafeNumber(spawnRule.radius, "Nature spawn radius");

      for (let spawnIndex = 0; spawnIndex < spawnRule.count; spawnIndex += 1) {
        let chosenTile: { x: bigint; y: bigint } | undefined = undefined;
        for (let attempt = 0; attempt < 64; attempt += 1) {
          const candidate = findOpenTileAroundCenter(
            terrainSeed,
            clusterCenterX,
            clusterCenterY,
            clusterRadius,
            width,
            height,
            occupiedTiles,
            (spawnRule.id * 1000n) + BigInt(spawnIndex * 64 + attempt),
          );
          if (!candidate) {
            break;
          }

          const candidateTerrainId = terrainByTile.get(tileKey(candidate.x, candidate.y));
          if (candidateTerrainId !== undefined && waterTerrainIds.has(candidateTerrainId)) {
            continue;
          }

          chosenTile = candidate;
          break;
        }

        if (!chosenTile) {
          continue;
        }

        occupiedTiles.add(tileKey(chosenTile.x, chosenTile.y));
        const createdUnit = ctx.db.unitInstances.insert({
          id: AUTO_INC_ID,
          createdAt: ctx.timestamp,
          mapInstanceId: mapInstance.id,
          empireId: NO_EMPIRE_SENTINEL,
          unitId: spawnRule.unitId,
          x: chosenTile.x,
          y: chosenTile.y,
          facingDirection: { tag: "down" },
          gatherX: chosenTile.x,
          gatherY: chosenTile.y
        });
        initializeUnitProperties(createdUnit.id, createdUnit.unitId);
      }
    }
  },
);

export const createEmpire = spacetimedb.reducer({name: "create_empire"}, {name: t.option(t.string()), mapInstanceId: t.u64() }, (ctx, { name, mapInstanceId }) => {
  const mapInstance = ctx.db.mapInstances.id.find(mapInstanceId);
  if (!mapInstance) {
    throw new SenderError("Map instance does not exist.");
  }

  const user = ctx.db.users.identity.find(ctx.sender);
  if (!user) {
    throw new SenderError("No user record found for current sender.");
  }

  const existingEmpires = [...ctx.db.empires.mapInstanceId.filter(mapInstanceId)];
  const empireCount = existingEmpires.length;
  if (empireCount >= mapInstance.empireLimit) {
    throw new SenderError("Empire limit reached for this map.");
  }

  for (const player of ctx.db.players.userId.filter(user.id)) {
    const existingEmpire = ctx.db.empires.id.find(player.empireId);
    if (existingEmpire && existingEmpire.mapInstanceId === mapInstanceId) {
      throw new SenderError("User already belongs to an empire on this map.");
    }
  }

  const preferredName = (name ?? "").trim();
  const generatedBaseName = preferredName.length > 0
    ? preferredName
    : `Empire ${user.id.toString().slice(0, 8)}`;
  const usedNames = new Set(existingEmpires.map((empire) => empire.name.toLowerCase()));
  let trimmedName = generatedBaseName;
  if (usedNames.has(trimmedName.toLowerCase())) {
    let suffix = 2;
    while (usedNames.has(`${generatedBaseName} ${suffix}`.toLowerCase())) {
      suffix += 1;
    }
    trimmedName = `${generatedBaseName} ${suffix}`;
  }

  const createdEmpire = ctx.db.empires.insert({
    id: AUTO_INC_ID,
    mapInstanceId,
    name: trimmedName,
    civilization: 0n,
    stockpileUnitInstanceId: NO_UNIT_SENTINEL
  });

  ctx.db.players.insert({
    id: AUTO_INC_ID,
    empireId: createdEmpire.id,
    userId: user.id
  });

  const mapWidth = toSafeNumber(mapInstance.width, "Map width");
  const mapHeight = toSafeNumber(mapInstance.height, "Map height");
  const centerX = Math.floor(mapWidth / 2);
  const centerY = Math.floor(mapHeight / 2);
  const spawnRingRadius = Math.max(2, Math.floor(Math.min(mapWidth, mapHeight) * 0.35));
  const angleDivisor = Math.max(1, Number(mapInstance.empireLimit));
  const angle = (Math.PI * 2 * empireCount) / angleDivisor;

  const spawnCenterX = clampInt(
    centerX + Math.round(Math.cos(angle) * spawnRingRadius),
    0,
    mapWidth - 1,
  );
  const spawnCenterY = clampInt(
    centerY + Math.round(Math.sin(angle) * spawnRingRadius),
    0,
    mapHeight - 1,
  );

  ctx.db.empireSpawnCenters.insert({
    id: AUTO_INC_ID,
    mapInstanceId: mapInstance.id,
    empireId: createdEmpire.id,
    x: BigInt(spawnCenterX),
    y: BigInt(spawnCenterY)
  });

  const initializeUnitProperties = (unitInstanceId: bigint, unitId: bigint): void => {
    for (const baseProperty of ctx.db.baseUnitProperties.unitId.filter(unitId)) {
      ctx.db.unitPropertyInstances.insert({
        id: AUTO_INC_ID,
        unitInstanceId,
        unitPropertyId: baseProperty.unitPropertyId,
        maxValue: baseProperty.value,
        value: baseProperty.value
      });
    }
  };

  const occupiedTiles = new Set<string>();
  for (const unit of ctx.db.unitInstances.mapInstanceId.filter(mapInstance.id)) {
    occupiedTiles.add(tileKey(unit.x, unit.y));
  }

  const spawnRules = [...ctx.db.mapSpawnUnits.mapId.filter(mapInstance.mapId)]
    .filter((rule) => !rule.nature);
  spawnRules.sort((left, right) => {
    if (left.id < right.id) {
      return -1;
    }
    if (left.id > right.id) {
      return 1;
    }
    return 0;
  });

  for (const spawnRule of spawnRules) {
    const unitDefinition = ctx.db.units.id.find(spawnRule.unitId);
    if (!unitDefinition) {
      continue;
    }

    const spawnRadius = toSafeNumber(spawnRule.radius, "Player spawn radius");
    for (let spawnIndex = 0; spawnIndex < spawnRule.count; spawnIndex += 1) {
      const spawnTile = findOpenTileAroundCenter(
        mapInstance.terrainSeed,
        spawnCenterX,
        spawnCenterY,
        spawnRadius,
        mapWidth,
        mapHeight,
        occupiedTiles,
        (createdEmpire.id * 1000n) + (spawnRule.id * 100n) + BigInt(spawnIndex),
      );
      if (!spawnTile) {
        continue;
      }

      occupiedTiles.add(tileKey(spawnTile.x, spawnTile.y));
      const unit = ctx.db.unitInstances.insert({
        id: AUTO_INC_ID,
        createdAt: ctx.timestamp,
        mapInstanceId: mapInstance.id,
        empireId: createdEmpire.id,
        unitId: spawnRule.unitId,
        x: spawnTile.x,
        y: spawnTile.y,
        facingDirection: { tag: "down" },
        gatherX: spawnTile.x,
        gatherY: spawnTile.y
      });
      initializeUnitProperties(unit.id, unit.unitId);
    }
  }
});

export const enqueueAction = spacetimedb.reducer({name: "enqueue_action"}, {actionId: t.u64(), sourceUnitId: t.u64(), targetUnitId: t.u64(), clearActionBacklog: t.bool()}, (ctx, props) => {
  const user = ctx.db.users.identity.find(ctx.sender);
  if (!user) {
    throw new SenderError("No user record found for current sender.");
  }

  const sourceUnit = ctx.db.unitInstances.id.find(props.sourceUnitId);
  if (!sourceUnit) {
    throw new SenderError("Source unit does not exist.");
  }

  let controlsSourceUnit = false;
  for (const player of ctx.db.players.userId.filter(user.id)) {
    if (player.empireId === sourceUnit.empireId) {
      controlsSourceUnit = true;
      break;
    }
  }
  if (!controlsSourceUnit) {
    throw new SenderError("Source unit is not controlled by this user.");
  }

  const action = ctx.db.actions.id.find(props.actionId);
  if (!action) {
    throw new SenderError("Action does not exist.");
  }
  if (action.sourceUnitId !== sourceUnit.unitId) {
    throw new SenderError("Action is not valid for this source unit type.");
  }

  const targetUnit = props.targetUnitId === NO_UNIT_SENTINEL
    ? undefined
    : ctx.db.unitInstances.id.find(props.targetUnitId);
  if (props.targetUnitId !== NO_UNIT_SENTINEL && !targetUnit) {
    throw new SenderError("Target unit does not exist.");
  }
  if (targetUnit && targetUnit.mapInstanceId !== sourceUnit.mapInstanceId) {
    throw new SenderError("Target unit is on a different map.");
  }
  if (targetUnit && action.targetUnitCategoryIds.length > 0) {
    const targetUnitMetadata = ctx.db.units.id.find(targetUnit.unitId);
    if (!targetUnitMetadata) {
      throw new SenderError("Target unit metadata is missing.");
    }
    if (!action.targetUnitCategoryIds.includes(targetUnitMetadata.unitCategoryId)) {
      throw new SenderError("Target unit category is not supported by this action.");
    }
  }

  if (props.clearActionBacklog) {
    const queuedIds: bigint[] = [];
    for (const queuedAction of ctx.db.actionSequenceNodes.unitInstanceId.filter(sourceUnit.id)) {
      queuedIds.push(queuedAction.id);
    }
    for (const queuedId of queuedIds) {
      ctx.db.actionSequenceNodes.id.delete(queuedId);
    }
  }

  const queueRows = [...ctx.db.actionSequenceNodes.unitInstanceId.filter(sourceUnit.id)];
  const tail = findQueueTailNode(queueRows);

  ctx.db.actionSequenceNodes.insert({
    id: AUTO_INC_ID,
    createdAt: ctx.timestamp,
    mapInstanceId: sourceUnit.mapInstanceId,
    unitInstanceId: sourceUnit.id,
    priorActionSequenceNodeId: tail ? tail.id : ACTION_QUEUE_HEAD_SENTINEL,
    actionId: action.id,
    targetUnitInstanceId: targetUnit ? targetUnit.id : NO_UNIT_SENTINEL,
    fromX: sourceUnit.x,
    fromY: sourceUnit.y
  });
});

// TODO: should be a scheduled reducer
export const tick = spacetimedb.reducer({name: "tick"}, (ctx) => {
  const clearActionQueue = (unitInstanceId: bigint): void => {
    const queueIds: bigint[] = [];
    for (const node of ctx.db.actionSequenceNodes.unitInstanceId.filter(unitInstanceId)) {
      queueIds.push(node.id);
    }
    for (const nodeId of queueIds) {
      ctx.db.actionSequenceNodes.id.delete(nodeId);
    }
  };

  const dequeueHeadNode = (unitInstanceId: bigint): void => {
    const queueRows = [...ctx.db.actionSequenceNodes.unitInstanceId.filter(unitInstanceId)];
    const head = findQueueHeadNode(queueRows);
    if (!head) {
      return;
    }

    const nextNode = findQueueNextNode(queueRows, head.id);

    if (nextNode) {
      ctx.db.actionSequenceNodes.id.update({
        ...nextNode,
        priorActionSequenceNodeId: ACTION_QUEUE_HEAD_SENTINEL
      });
    }

    ctx.db.actionSequenceNodes.id.delete(head.id);
  };

  const initializeUnitProperties = (unitInstance: ReturnType<typeof ctx.db.unitInstances.insert>): void => {
    for (const baseProperty of ctx.db.baseUnitProperties.unitId.filter(unitInstance.unitId)) {
      ctx.db.unitPropertyInstances.insert({
        id: AUTO_INC_ID,
        unitInstanceId: unitInstance.id,
        unitPropertyId: baseProperty.unitPropertyId,
        maxValue: baseProperty.value,
        value: baseProperty.value
      });
    }
  };

  const getOrCreateUnitProperty = (unitInstance: ReturnType<typeof ctx.db.unitInstances.insert>, unitPropertyId: bigint) => {
    for (const property of ctx.db.unitPropertyInstances.unitInstanceId.filter(unitInstance.id)) {
      if (property.unitPropertyId === unitPropertyId) {
        return property;
      }
    }

    let baseProperty = undefined;
    for (const row of ctx.db.baseUnitProperties.unitId.filter(unitInstance.unitId)) {
      if (row.unitPropertyId === unitPropertyId) {
        baseProperty = row;
        break;
      }
    }
    if (!baseProperty) {
      return undefined;
    }

    return ctx.db.unitPropertyInstances.insert({
      id: AUTO_INC_ID,
      unitInstanceId: unitInstance.id,
      unitPropertyId: baseProperty.unitPropertyId,
      maxValue: baseProperty.value,
      value: baseProperty.value
    });
  };

  const ungarrisonUnit = (garrisonedUnitInstanceId: bigint): void => {
    const garrison = ctx.db.unitGarrisons.garrisonedUnitInstanceId.find(garrisonedUnitInstanceId);
    if (!garrison) {
      return;
    }

    const host = ctx.db.unitInstances.id.find(garrison.hostUnitInstanceId);
    const garrisoned = ctx.db.unitInstances.id.find(garrison.garrisonedUnitInstanceId);
    if (garrisoned) {
      ctx.db.unitInstances.id.update({
        ...garrisoned,
        x: host ? host.x : garrison.fallbackX,
        y: host ? host.y : garrison.fallbackY
      });
    }

    ctx.db.unitGarrisons.id.delete(garrison.id);
  };

  const garrisonUnit = (hostUnitInstanceId: bigint, garrisonedUnitInstanceId: bigint): void => {
    if (hostUnitInstanceId === garrisonedUnitInstanceId) {
      return;
    }

    const host = ctx.db.unitInstances.id.find(hostUnitInstanceId);
    const garrisoned = ctx.db.unitInstances.id.find(garrisonedUnitInstanceId);
    if (!host || !garrisoned) {
      return;
    }

    const existing = ctx.db.unitGarrisons.garrisonedUnitInstanceId.find(garrisoned.id);
    if (existing) {
      ctx.db.unitGarrisons.id.update({
        ...existing,
        mapInstanceId: host.mapInstanceId,
        hostUnitInstanceId: host.id,
        fallbackX: garrisoned.x,
        fallbackY: garrisoned.y
      });
    } else {
      ctx.db.unitGarrisons.insert({
        id: AUTO_INC_ID,
        mapInstanceId: host.mapInstanceId,
        hostUnitInstanceId: host.id,
        garrisonedUnitInstanceId: garrisoned.id,
        fallbackX: garrisoned.x,
        fallbackY: garrisoned.y
      });
    }

    ctx.db.unitInstances.id.update({
      ...garrisoned,
      mapInstanceId: host.mapInstanceId,
      x: host.x,
      y: host.y
    });
  };

  const removeUnitAndDependents = (unitInstanceId: bigint): void => {
    clearActionQueue(unitInstanceId);

    const propertyIds: bigint[] = [];
    for (const property of ctx.db.unitPropertyInstances.unitInstanceId.filter(unitInstanceId)) {
      propertyIds.push(property.id);
    }
    for (const propertyId of propertyIds) {
      ctx.db.unitPropertyInstances.id.delete(propertyId);
    }

    const garrisonIds: bigint[] = [];
    for (const garrison of ctx.db.unitGarrisons.iter()) {
      if (
        garrison.hostUnitInstanceId === unitInstanceId
        || garrison.garrisonedUnitInstanceId === unitInstanceId
      ) {
        garrisonIds.push(garrison.id);
      }
    }
    for (const garrisonId of garrisonIds) {
      const garrison = ctx.db.unitGarrisons.id.find(garrisonId);
      if (garrison && garrison.garrisonedUnitInstanceId !== unitInstanceId) {
        ungarrisonUnit(garrison.garrisonedUnitInstanceId);
      } else {
        ctx.db.unitGarrisons.id.delete(garrisonId);
      }
    }

    ctx.db.unitInstances.id.delete(unitInstanceId);
  };

  const handleUnitDeath = (targetUnitInstanceId: bigint, sourceActionId: bigint): boolean => {
    const targetUnit = ctx.db.unitInstances.id.find(targetUnitInstanceId);
    if (!targetUnit) {
      return false;
    }

    const targetMetadata = ctx.db.units.id.find(targetUnit.unitId);
    if (!targetMetadata || targetMetadata.deathByUnitPropertyId === NO_PROPERTY_SENTINEL) {
      return false;
    }

    const deathProperty = getOrCreateUnitProperty(targetUnit, targetMetadata.deathByUnitPropertyId);
    if (!deathProperty) {
      return false;
    }

    const isDead = targetMetadata.deathByZero
      ? deathProperty.value === 0
      : deathProperty.value >= deathProperty.maxValue;
    if (!isDead) {
      return false;
    }

    let replacementUnitId: bigint | undefined = undefined;
    for (const progression of ctx.db.unitDeathProgressions.datasetId.filter(targetMetadata.datasetId)) {
      if (progression.sourceActionId === sourceActionId || progression.sourceActionId === ANY_ACTION_SENTINEL) {
        replacementUnitId = progression.replaceWithUnitId;
        break;
      }
    }

    const fallbackFacing = targetUnit.facingDirection;
    const fallbackX = targetUnit.x;
    const fallbackY = targetUnit.y;
    const fallbackGatherX = targetUnit.gatherX;
    const fallbackGatherY = targetUnit.gatherY;
    const fallbackMapInstanceId = targetUnit.mapInstanceId;
    const fallbackEmpireId = targetUnit.empireId;

    removeUnitAndDependents(targetUnit.id);

    if (replacementUnitId !== undefined) {
      const replacementUnit = ctx.db.unitInstances.insert({
        id: AUTO_INC_ID,
        createdAt: ctx.timestamp,
        mapInstanceId: fallbackMapInstanceId,
        empireId: fallbackEmpireId,
        unitId: replacementUnitId,
        x: fallbackX,
        y: fallbackY,
        facingDirection: fallbackFacing,
        gatherX: fallbackGatherX,
        gatherY: fallbackGatherY
      });
      initializeUnitProperties(replacementUnit);
    }

    return true;
  };

  const clampBigInt = (value: bigint, min: bigint, max: bigint): bigint => {
    if (value < min) {
      return min;
    }
    if (value > max) {
      return max;
    }
    return value;
  };

  const absBigInt = (value: bigint): bigint => {
    if (value < 0n) {
      return -value;
    }
    return value;
  };

  const chebyshevDistance = (
    fromX: bigint,
    fromY: bigint,
    toX: bigint,
    toY: bigint,
  ): bigint => {
    const deltaX = absBigInt(fromX - toX);
    const deltaY = absBigInt(fromY - toY);
    return deltaX > deltaY ? deltaX : deltaY;
  };

  const directionFromStep = (
    stepX: bigint,
    stepY: bigint,
    fallbackDirection: ReturnType<typeof ctx.db.unitInstances.insert>["facingDirection"]["tag"],
  ): ReturnType<typeof ctx.db.unitInstances.insert>["facingDirection"]["tag"] => {
    if (stepX === 0n && stepY < 0n) {
      return "up";
    }
    if (stepX > 0n && stepY < 0n) {
      return "rightUp";
    }
    if (stepX > 0n && stepY === 0n) {
      return "right";
    }
    if (stepX > 0n && stepY > 0n) {
      return "rightDown";
    }
    if (stepX === 0n && stepY > 0n) {
      return "down";
    }
    if (stepX < 0n && stepY > 0n) {
      return "leftDown";
    }
    if (stepX < 0n && stepY === 0n) {
      return "left";
    }
    if (stepX < 0n && stepY < 0n) {
      return "leftUp";
    }
    return fallbackDirection;
  };

  const resolveActionRange = (
    sourceUnit: ReturnType<typeof ctx.db.unitInstances.insert>,
    action: ReturnType<typeof ctx.db.actions.insert>,
  ): { constrained: boolean; minimumRange: bigint; maximumRange: bigint | undefined } => {
    let constrained = false;
    let minimumRange = 0n;
    if (action.minimumRangeUnitPropertyId !== NO_PROPERTY_SENTINEL) {
      constrained = true;
      const minimumRangeProperty = getOrCreateUnitProperty(sourceUnit, action.minimumRangeUnitPropertyId);
      minimumRange = BigInt(minimumRangeProperty ? minimumRangeProperty.value : 0);
    }

    let maximumRange: bigint | undefined = undefined;
    if (action.maximumRangeUnitPropertyId !== NO_PROPERTY_SENTINEL) {
      constrained = true;
      const maximumRangeProperty = getOrCreateUnitProperty(sourceUnit, action.maximumRangeUnitPropertyId);
      maximumRange = BigInt(maximumRangeProperty ? maximumRangeProperty.value : 0);
    }

    if (maximumRange !== undefined && maximumRange < minimumRange) {
      maximumRange = minimumRange;
    }

    return {
      constrained,
      minimumRange,
      maximumRange
    };
  };

  const moveForRange = (
    sourceUnit: ReturnType<typeof ctx.db.unitInstances.insert>,
    targetUnit: ReturnType<typeof ctx.db.unitInstances.insert>,
    mode: "toward" | "away",
  ): boolean => {
    const mapInstance = ctx.db.mapInstances.id.find(sourceUnit.mapInstanceId);
    if (!mapInstance || mapInstance.width === 0n || mapInstance.height === 0n) {
      return false;
    }

    const xDirectionToward = targetUnit.x > sourceUnit.x
      ? 1n
      : targetUnit.x < sourceUnit.x
        ? -1n
        : 0n;
    const yDirectionToward = targetUnit.y > sourceUnit.y
      ? 1n
      : targetUnit.y < sourceUnit.y
        ? -1n
        : 0n;

    const primaryStepX = mode === "toward" ? xDirectionToward : -xDirectionToward;
    const primaryStepY = mode === "toward" ? yDirectionToward : -yDirectionToward;

    const candidates: Array<{ x: bigint; y: bigint }> = [];
    const addCandidate = (x: bigint, y: bigint): void => {
      if (x === 0n && y === 0n) {
        return;
      }
      for (const existing of candidates) {
        if (existing.x === x && existing.y === y) {
          return;
        }
      }
      candidates.push({ x, y });
    };

    addCandidate(primaryStepX, primaryStepY);
    addCandidate(primaryStepX, 0n);
    addCandidate(0n, primaryStepY);

    if (mode === "away" && primaryStepX === 0n && primaryStepY === 0n) {
      addCandidate(1n, 0n);
      addCandidate(0n, 1n);
      addCandidate(-1n, 0n);
      addCandidate(0n, -1n);
      addCandidate(1n, 1n);
      addCandidate(-1n, 1n);
      addCandidate(1n, -1n);
      addCandidate(-1n, -1n);
    }

    const maxX = mapInstance.width - 1n;
    const maxY = mapInstance.height - 1n;
    for (const candidate of candidates) {
      const nextX = clampBigInt(sourceUnit.x + candidate.x, 0n, maxX);
      const nextY = clampBigInt(sourceUnit.y + candidate.y, 0n, maxY);
      if (nextX === sourceUnit.x && nextY === sourceUnit.y) {
        continue;
      }

      ctx.db.unitInstances.id.update({
        ...sourceUnit,
        x: nextX,
        y: nextY,
        facingDirection: {
          tag: directionFromStep(candidate.x, candidate.y, sourceUnit.facingDirection.tag)
        }
      });
      return true;
    }

    return false;
  };

  const headNodesByUnit = new Map<bigint, ReturnType<typeof ctx.db.actionSequenceNodes.insert>>();
  for (const actionNode of ctx.db.actionSequenceNodes.iter()) {
    if (actionNode.priorActionSequenceNodeId !== ACTION_QUEUE_HEAD_SENTINEL) {
      continue;
    }

    const current = headNodesByUnit.get(actionNode.unitInstanceId);
    if (!current || actionNode.createdAt.microsSinceUnixEpoch < current.createdAt.microsSinceUnixEpoch) {
      headNodesByUnit.set(actionNode.unitInstanceId, actionNode);
    }
  }

  const orderedUnitInstanceIds = [...headNodesByUnit.keys()].sort((left, right) => {
    if (left < right) {
      return -1;
    }
    if (left > right) {
      return 1;
    }
    return 0;
  });

  for (const unitInstanceId of orderedUnitInstanceIds) {
    const headNode = headNodesByUnit.get(unitInstanceId);
    if (!headNode) {
      continue;
    }

    const sourceUnit = ctx.db.unitInstances.id.find(unitInstanceId);
    if (!sourceUnit) {
      clearActionQueue(unitInstanceId);
      continue;
    }

    const action = ctx.db.actions.id.find(headNode.actionId);
    if (!action) {
      dequeueHeadNode(unitInstanceId);
      continue;
    }

    const targetUnit = headNode.targetUnitInstanceId === NO_UNIT_SENTINEL
      ? undefined
      : ctx.db.unitInstances.id.find(headNode.targetUnitInstanceId);
    if (headNode.targetUnitInstanceId !== NO_UNIT_SENTINEL && !targetUnit) {
      dequeueHeadNode(unitInstanceId);
      continue;
    }
    if (targetUnit && targetUnit.mapInstanceId !== sourceUnit.mapInstanceId) {
      dequeueHeadNode(unitInstanceId);
      continue;
    }

    const effects = [...ctx.db.actionEffects.actionId.filter(action.id)];
    effects.sort((left, right) => {
      if (left.id < right.id) {
        return -1;
      }
      if (left.id > right.id) {
        return 1;
      }
      return 0;
    });
    if (effects.length === 0) {
      dequeueHeadNode(unitInstanceId);
      continue;
    }

    if (targetUnit) {
      const actionRange = resolveActionRange(sourceUnit, action);
      if (actionRange.constrained) {
        const targetDistance = chebyshevDistance(sourceUnit.x, sourceUnit.y, targetUnit.x, targetUnit.y);
        const tooClose = targetDistance < actionRange.minimumRange;
        const tooFar = actionRange.maximumRange !== undefined && targetDistance > actionRange.maximumRange;
        if (tooClose || tooFar) {
          moveForRange(sourceUnit, targetUnit, tooFar ? "toward" : "away");
          continue;
        }
      }
    }

    let shouldDequeue = !action.repeats;
    let targetDied = false;

    for (const effect of effects) {
      if (effect.sourceGarrisons && targetUnit) {
        garrisonUnit(targetUnit.id, sourceUnit.id);
        shouldDequeue = true;
      }
      if (effect.targetGarrisons && targetUnit) {
        garrisonUnit(sourceUnit.id, targetUnit.id);
        shouldDequeue = true;
      }
      if (effect.sourceUngarrisons) {
        ungarrisonUnit(sourceUnit.id);
        shouldDequeue = true;
      }
      if (effect.targetUngarrisons && targetUnit) {
        ungarrisonUnit(targetUnit.id);
        shouldDequeue = true;
      }
      if (effect.targetConverts && targetUnit && targetUnit.empireId !== sourceUnit.empireId) {
        ctx.db.unitInstances.id.update({
          ...targetUnit,
          empireId: sourceUnit.empireId
        });
        shouldDequeue = true;
      }
      if (effect.spawnProjectileUnitId !== NO_UNIT_SENTINEL) {
        const projectile = ctx.db.unitInstances.insert({
          id: AUTO_INC_ID,
          createdAt: ctx.timestamp,
          mapInstanceId: sourceUnit.mapInstanceId,
          empireId: sourceUnit.empireId,
          unitId: effect.spawnProjectileUnitId,
          x: sourceUnit.x,
          y: sourceUnit.y,
          facingDirection: sourceUnit.facingDirection,
          gatherX: sourceUnit.gatherX,
          gatherY: sourceUnit.gatherY
        });
        initializeUnitProperties(projectile);
      }

      if (!targetUnit || effect.targetUnitPropertyId === NO_PROPERTY_SENTINEL) {
        continue;
      }

      const targetProperty = getOrCreateUnitProperty(targetUnit, effect.targetUnitPropertyId);
      if (!targetProperty) {
        continue;
      }

      let sourceMagnitude = 1;
      if (effect.sourceUnitPropertyId !== NO_PROPERTY_SENTINEL) {
        const sourceProperty = getOrCreateUnitProperty(sourceUnit, effect.sourceUnitPropertyId);
        sourceMagnitude = sourceProperty ? sourceProperty.value : 0;
      }

      let defenseMagnitude = 0;
      if (effect.targetDefensePropertyId !== NO_PROPERTY_SENTINEL) {
        const defenseProperty = getOrCreateUnitProperty(targetUnit, effect.targetDefensePropertyId);
        defenseMagnitude = defenseProperty ? defenseProperty.value : 0;
      }

      const effectiveMagnitude = Math.max(sourceMagnitude - defenseMagnitude, 0);
      let nextValue = targetProperty.value;
      const direction = effect.targetUnitPropertyDirection.tag;
      if (direction === "add") {
        nextValue = clampU32(targetProperty.value + effectiveMagnitude, targetProperty.maxValue);
      } else if (direction === "sub") {
        nextValue = clampU32(targetProperty.value - effectiveMagnitude, targetProperty.maxValue);
      } else {
        nextValue = clampU32(effectiveMagnitude, targetProperty.maxValue);
      }

      if (nextValue !== targetProperty.value) {
        ctx.db.unitPropertyInstances.id.update({
          ...targetProperty,
          value: nextValue
        });
      }

      const reachedLimit = direction === "add"
        ? nextValue >= targetProperty.maxValue
        : direction === "sub"
          ? nextValue === 0
          : true;
      if (reachedLimit) {
        shouldDequeue = true;
      }

      if (handleUnitDeath(targetUnit.id, action.id)) {
        targetDied = true;
      }
    }

    if (targetDied || shouldDequeue) {
      dequeueHeadNode(unitInstanceId);
    }
  }
});
