/**
 * @file SignatureAnalyzer.ts
 * @description AST-based function signature analysis for JS/TS files.
 *
 * Parses source files using @babel/parser, extracts function/method declarations
 * and their parameter signatures, and diffs old vs new signatures to detect
 * additions/removals/reordering of parameters.
 */

import * as parser from "@babel/parser";
import _traverse from "@babel/traverse";

// Handle both CJS and ESM default export from @babel/traverse
const traverse = (typeof _traverse === "function" ? _traverse : (_traverse as any).default) as typeof _traverse;

export interface FunctionSignature {
  name: string;
  params: string[];
  startLine: number;
  endLine: number;
  /** The file this function was found in */
  file: string;
}

export interface SignatureChange {
  functionName: string;
  file: string;
  oldParams: string[];
  newParams: string[];
  changeType: "signature_change" | "function_added" | "function_removed";
}

/**
 * Parse a JS/TS source string and extract all function signatures.
 */
export function extractSignatures(source: string, file: string): FunctionSignature[] {
  const cleanSource = source.replace(/^\uFEFF/, "");
  const signatures: FunctionSignature[] = [];

  let ast;
  try {
    ast = parser.parse(cleanSource, {
      sourceType: "module",
      plugins: ["typescript", "jsx", "decorators-legacy", "classProperties"],
      errorRecovery: true,
    });
  } catch {
    // If parsing fails, return empty — we don't crash on unparseable files
    return [];
  }

  traverse(ast, {
    // Regular function declarations: function foo(a, b) {}
    FunctionDeclaration(path) {
      if (path.node.id) {
        signatures.push({
          name: path.node.id.name,
          params: path.node.params.map(paramToString),
          startLine: path.node.loc?.start.line ?? 0,
          endLine: path.node.loc?.end.line ?? 0,
          file,
        });
      }
    },

    // Variable declarations with arrow/function: const foo = (a, b) => {}
    VariableDeclarator(path) {
      if (
        path.node.id.type === "Identifier" &&
        path.node.init &&
        (path.node.init.type === "ArrowFunctionExpression" ||
          path.node.init.type === "FunctionExpression")
      ) {
        const fn = path.node.init;
        signatures.push({
          name: path.node.id.name,
          params: fn.params.map(paramToString),
          startLine: path.node.loc?.start.line ?? 0,
          endLine: path.node.loc?.end.line ?? 0,
          file,
        });
      }
    },

    // Class methods: class Foo { bar(a, b) {} }
    ClassMethod(path) {
      if (path.node.key.type === "Identifier") {
        const className =
          path.parentPath.parentPath?.node &&
          (path.parentPath.parentPath.node as any).id?.name;
        const prefix = className ? `${className}.` : "";
        signatures.push({
          name: `${prefix}${path.node.key.name}`,
          params: path.node.params.map(paramToString),
          startLine: path.node.loc?.start.line ?? 0,
          endLine: path.node.loc?.end.line ?? 0,
          file,
        });
      }
    },

    // Object methods and exports: module.exports = { foo(a, b) {} }
    ObjectMethod(path) {
      if (path.node.key.type === "Identifier") {
        signatures.push({
          name: path.node.key.name,
          params: path.node.params.map(paramToString),
          startLine: path.node.loc?.start.line ?? 0,
          endLine: path.node.loc?.end.line ?? 0,
          file,
        });
      }
    },
  });

  return signatures;
}

/**
 * Diff two sets of signatures and return changes.
 */
export function diffSignatures(
  oldSigs: FunctionSignature[],
  newSigs: FunctionSignature[],
  file: string
): SignatureChange[] {
  const changes: SignatureChange[] = [];
  const oldMap = new Map(oldSigs.map((s) => [s.name, s]));
  const newMap = new Map(newSigs.map((s) => [s.name, s]));

  // Check for modified or removed functions
  for (const [name, oldSig] of oldMap) {
    const newSig = newMap.get(name);
    if (!newSig) {
      changes.push({
        functionName: name,
        file,
        oldParams: oldSig.params,
        newParams: [],
        changeType: "function_removed",
      });
    } else if (JSON.stringify(oldSig.params) !== JSON.stringify(newSig.params)) {
      changes.push({
        functionName: name,
        file,
        oldParams: oldSig.params,
        newParams: newSig.params,
        changeType: "signature_change",
      });
    }
  }

  // Check for added functions
  for (const [name, newSig] of newMap) {
    if (!oldMap.has(name)) {
      changes.push({
        functionName: name,
        file,
        oldParams: [],
        newParams: newSig.params,
        changeType: "function_added",
      });
    }
  }

  return changes;
}

/** Convert a Babel param node to a readable string */
function paramToString(param: any): string {
  switch (param.type) {
    case "Identifier":
      return param.name;
    case "AssignmentPattern":
      return param.left?.name ?? "default";
    case "RestElement":
      return `...${param.argument?.name ?? "rest"}`;
    case "ObjectPattern":
      return "{}";
    case "ArrayPattern":
      return "[]";
    default:
      return "unknown";
  }
}
