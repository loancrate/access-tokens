import type { TokenRecord } from "@access-tokens/client";

import type { TokenDefinition } from "../../config/schemas";
import { compareTokens } from "../diff";

describe("compareTokens", () => {
  const baseDefinition: TokenDefinition = {
    tokenId: "test123456789012345",
    owner: "test-owner",
    isAdmin: false,
    revoked: false,
  };

  const baseRemote: TokenRecord = {
    tokenId: "test123456789012345",
    owner: "test-owner",
    isAdmin: false,
    createdAt: 1704067200,
  };

  describe("token existence", () => {
    it("should return exists:false when remote token does not exist", () => {
      const result = compareTokens(baseDefinition, undefined);

      expect(result).toEqual({
        tokenId: "test123456789012345",
        exists: false,
        changes: [],
        needsRevoke: false,
        needsRestore: false,
        needsUpdate: false,
      });
    });

    it("should return exists:true when remote token exists", () => {
      const result = compareTokens(baseDefinition, baseRemote);

      expect(result.exists).toBe(true);
    });
  });

  describe("no changes", () => {
    it("should detect no changes when tokens match", () => {
      const result = compareTokens(baseDefinition, baseRemote);

      expect(result).toEqual({
        tokenId: "test123456789012345",
        exists: true,
        changes: [],
        needsRevoke: false,
        needsRestore: false,
        needsUpdate: false,
      });
    });
  });

  describe("owner changes", () => {
    it("should detect owner change", () => {
      const definition: TokenDefinition = {
        ...baseDefinition,
        owner: "new-owner",
      };

      const result = compareTokens(definition, baseRemote);

      expect(result.changes).toEqual([
        {
          field: "owner",
          oldValue: "test-owner",
          newValue: "new-owner",
        },
      ]);
      expect(result.needsUpdate).toBe(true);
    });
  });

  describe("isAdmin changes", () => {
    it("should detect isAdmin change from false to true", () => {
      const definition: TokenDefinition = {
        ...baseDefinition,
        isAdmin: true,
      };

      const result = compareTokens(definition, baseRemote);

      expect(result.changes).toEqual([
        {
          field: "isAdmin",
          oldValue: false,
          newValue: true,
        },
      ]);
      expect(result.needsUpdate).toBe(true);
    });

    it("should detect isAdmin change from true to false", () => {
      const definition: TokenDefinition = {
        ...baseDefinition,
        isAdmin: false,
      };

      const remote: TokenRecord = {
        ...baseRemote,
        isAdmin: true,
      };

      const result = compareTokens(definition, remote);

      expect(result.changes).toEqual([
        {
          field: "isAdmin",
          oldValue: true,
          newValue: false,
        },
      ]);
      expect(result.needsUpdate).toBe(true);
    });

    it("should not detect change when isAdmin is undefined in definition", () => {
      const definition: TokenDefinition = {
        tokenId: baseDefinition.tokenId,
        owner: baseDefinition.owner,
        isAdmin: false,
        revoked: false,
      };

      const result = compareTokens(definition, baseRemote);

      expect(result.changes).toEqual([]);
      expect(result.needsUpdate).toBe(false);
    });
  });

  describe("roles changes", () => {
    it("should detect roles added", () => {
      const definition: TokenDefinition = {
        ...baseDefinition,
        roles: ["admin", "reader"],
      };

      const result = compareTokens(definition, baseRemote);

      expect(result.changes).toEqual([
        {
          field: "roles",
          oldValue: [],
          newValue: ["admin", "reader"],
        },
      ]);
      expect(result.needsUpdate).toBe(true);
    });

    it("should detect roles removed", () => {
      const definition: TokenDefinition = {
        ...baseDefinition,
        roles: [],
      };

      const remote: TokenRecord = {
        ...baseRemote,
        roles: ["admin", "reader"],
      };

      const result = compareTokens(definition, remote);

      expect(result.changes).toEqual([
        {
          field: "roles",
          oldValue: ["admin", "reader"],
          newValue: [],
        },
      ]);
      expect(result.needsUpdate).toBe(true);
    });

    it("should detect roles changed", () => {
      const definition: TokenDefinition = {
        ...baseDefinition,
        roles: ["writer"],
      };

      const remote: TokenRecord = {
        ...baseRemote,
        roles: ["reader"],
      };

      const result = compareTokens(definition, remote);

      expect(result.changes).toEqual([
        {
          field: "roles",
          oldValue: ["reader"],
          newValue: ["writer"],
        },
      ]);
      expect(result.needsUpdate).toBe(true);
    });

    it("should not detect change when roles are same but in different order", () => {
      const definition: TokenDefinition = {
        ...baseDefinition,
        roles: ["reader", "admin"],
      };

      const remote: TokenRecord = {
        ...baseRemote,
        roles: ["admin", "reader"],
      };

      const result = compareTokens(definition, remote);

      expect(result.changes).toEqual([]);
      expect(result.needsUpdate).toBe(false);
    });

    it("should not detect change when roles is undefined in definition", () => {
      const remote: TokenRecord = {
        ...baseRemote,
        roles: ["admin"],
      };

      const result = compareTokens(baseDefinition, remote);

      expect(result.changes).toEqual([]);
      expect(result.needsUpdate).toBe(false);
    });
  });

  describe("secretPhc changes", () => {
    it("should detect secretPhc change", () => {
      const definition: TokenDefinition = {
        ...baseDefinition,
        secretPhc: "$scrypt$new$hash",
      };

      const remote: TokenRecord = {
        ...baseRemote,
        secretPhc: "$scrypt$old$hash",
      };

      const result = compareTokens(definition, remote);

      expect(result.changes).toEqual([
        {
          field: "secretPhc",
          oldValue: "[hidden]",
          newValue: "[updated]",
        },
      ]);
      expect(result.needsUpdate).toBe(true);
    });

    it("should not detect change when secretPhc is undefined", () => {
      const remote: TokenRecord = {
        ...baseRemote,
        secretPhc: "$scrypt$old$hash",
      };

      const result = compareTokens(baseDefinition, remote);

      expect(result.changes).toEqual([]);
      expect(result.needsUpdate).toBe(false);
    });

    it("should not detect change when secretPhc matches", () => {
      const secretPhc = "$scrypt$same$hash";
      const definition: TokenDefinition = {
        ...baseDefinition,
        secretPhc,
      };

      const remote: TokenRecord = {
        ...baseRemote,
        secretPhc,
      };

      const result = compareTokens(definition, remote);

      expect(result.changes).toEqual([]);
      expect(result.needsUpdate).toBe(false);
    });
  });

  describe("expiresAt changes", () => {
    it("should detect expiresAt change", () => {
      const definition: TokenDefinition = {
        ...baseDefinition,
        expiresAt: 1704153600,
      };

      const remote: TokenRecord = {
        ...baseRemote,
        expiresAt: 1704067200,
      };

      const result = compareTokens(definition, remote);

      expect(result.changes).toEqual([
        {
          field: "expiresAt",
          oldValue: 1704067200,
          newValue: 1704153600,
        },
      ]);
      expect(result.needsUpdate).toBe(true);
    });

    it("should detect expiresAt change from null to value", () => {
      const definition: TokenDefinition = {
        ...baseDefinition,
        expiresAt: 1704153600,
      };

      const result = compareTokens(definition, baseRemote);

      expect(result.changes).toEqual([
        {
          field: "expiresAt",
          oldValue: undefined,
          newValue: 1704153600,
        },
      ]);
      expect(result.needsUpdate).toBe(true);
    });

    it("should detect expiresAt change from value to null", () => {
      const definition: TokenDefinition = {
        ...baseDefinition,
        expiresAt: null,
      };

      const remote: TokenRecord = {
        ...baseRemote,
        expiresAt: 1704067200,
      };

      const result = compareTokens(definition, remote);

      expect(result.changes).toEqual([
        {
          field: "expiresAt",
          oldValue: 1704067200,
          newValue: null,
        },
      ]);
      expect(result.needsUpdate).toBe(true);
    });

    it("should not detect change when expiresAt is undefined", () => {
      const remote: TokenRecord = {
        ...baseRemote,
        expiresAt: 1704067200,
      };

      const result = compareTokens(baseDefinition, remote);

      expect(result.changes).toEqual([]);
      expect(result.needsUpdate).toBe(false);
    });
  });

  describe("revoke and restore", () => {
    it("should detect needsRevoke when definition is revoked but remote is not", () => {
      const definition: TokenDefinition = {
        ...baseDefinition,
        revoked: true,
      };

      const result = compareTokens(definition, baseRemote);

      expect(result.needsRevoke).toBe(true);
      expect(result.needsRestore).toBe(false);
    });

    it("should detect needsRestore when remote is revoked but definition is not", () => {
      const remote: TokenRecord = {
        ...baseRemote,
        revokedAt: 1704067200,
      };

      const result = compareTokens(baseDefinition, remote);

      expect(result.needsRevoke).toBe(false);
      expect(result.needsRestore).toBe(true);
    });

    it("should not need revoke when both are revoked", () => {
      const definition: TokenDefinition = {
        ...baseDefinition,
        revoked: true,
      };

      const remote: TokenRecord = {
        ...baseRemote,
        revokedAt: 1704067200,
      };

      const result = compareTokens(definition, remote);

      expect(result.needsRevoke).toBe(false);
      expect(result.needsRestore).toBe(false);
    });

    it("should not need restore when neither is revoked", () => {
      const result = compareTokens(baseDefinition, baseRemote);

      expect(result.needsRevoke).toBe(false);
      expect(result.needsRestore).toBe(false);
    });
  });

  describe("multiple changes", () => {
    it("should detect multiple field changes", () => {
      const definition: TokenDefinition = {
        ...baseDefinition,
        owner: "new-owner",
        isAdmin: true,
        expiresAt: 1704153600,
      };

      const result = compareTokens(definition, baseRemote);

      expect(result.changes).toHaveLength(3);
      expect(result.changes).toContainEqual({
        field: "owner",
        oldValue: "test-owner",
        newValue: "new-owner",
      });
      expect(result.changes).toContainEqual({
        field: "isAdmin",
        oldValue: false,
        newValue: true,
      });
      expect(result.changes).toContainEqual({
        field: "expiresAt",
        oldValue: undefined,
        newValue: 1704153600,
      });
      expect(result.needsUpdate).toBe(true);
    });

    it("should handle revoke with other changes", () => {
      const definition: TokenDefinition = {
        ...baseDefinition,
        owner: "new-owner",
        revoked: true,
      };

      const result = compareTokens(definition, baseRemote);

      expect(result.needsRevoke).toBe(true);
      expect(result.changes).toContainEqual({
        field: "owner",
        oldValue: "test-owner",
        newValue: "new-owner",
      });
      expect(result.needsUpdate).toBe(true);
    });

    it("should handle restore with other changes", () => {
      const definition: TokenDefinition = {
        ...baseDefinition,
        owner: "new-owner",
      };

      const remote: TokenRecord = {
        ...baseRemote,
        revokedAt: 1704067200,
      };

      const result = compareTokens(definition, remote);

      expect(result.needsRestore).toBe(true);
      expect(result.changes).toContainEqual({
        field: "owner",
        oldValue: "test-owner",
        newValue: "new-owner",
      });
      expect(result.needsUpdate).toBe(true);
    });
  });
});
