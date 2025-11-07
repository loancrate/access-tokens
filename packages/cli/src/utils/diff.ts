import type { TokenRecord } from "@access-tokens/client";

import type { TokenDefinition } from "../config/schemas";

export type TokenChange = {
  field: string;
  oldValue: unknown;
  newValue: unknown;
};

export type TokenDiff = {
  tokenId: string;
  exists: boolean;
  changes: TokenChange[];
  needsRevoke: boolean;
  needsRestore: boolean;
  needsUpdate: boolean;
};

export function compareTokens(
  definition: TokenDefinition,
  remote: TokenRecord | undefined,
): TokenDiff {
  const changes: TokenChange[] = [];
  let needsRevoke = false;
  let needsRestore = false;

  if (!remote) {
    return {
      tokenId: definition.tokenId,
      exists: false,
      changes: [],
      needsRevoke: false,
      needsRestore: false,
      needsUpdate: false,
    };
  }

  const isRemoteRevoked = remote.revokedAt != null;
  const shouldBeRevoked = definition.revoked || false;

  if (shouldBeRevoked && !isRemoteRevoked) {
    needsRevoke = true;
  } else if (!shouldBeRevoked && isRemoteRevoked) {
    needsRestore = true;
  }

  if (definition.owner !== remote.owner) {
    changes.push({
      field: "owner",
      oldValue: remote.owner,
      newValue: definition.owner,
    });
  }

  if (
    definition.isAdmin !== undefined &&
    definition.isAdmin !== remote.isAdmin
  ) {
    changes.push({
      field: "isAdmin",
      oldValue: remote.isAdmin,
      newValue: definition.isAdmin,
    });
  }

  if (definition.secretPhc && definition.secretPhc !== remote.secretPhc) {
    changes.push({
      field: "secretPhc",
      oldValue: "[hidden]",
      newValue: "[updated]",
    });
  }

  if (
    definition.expiresAt !== undefined &&
    definition.expiresAt !== remote.expiresAt
  ) {
    changes.push({
      field: "expiresAt",
      oldValue: remote.expiresAt,
      newValue: definition.expiresAt,
    });
  }

  const needsUpdate = changes.length > 0;

  return {
    tokenId: definition.tokenId,
    exists: true,
    changes,
    needsRevoke,
    needsRestore,
    needsUpdate,
  };
}
