/**
 * @file DependencyGraph.ts
 * @description Builds a function → callers map by walking AST import/require
 * statements and call expressions.
 *
 * Scope: JS/TS only per PRD MVP.
 */

import * as parser from "@babel/parser";
import _traverse from "@babel/traverse";
import * as path from "path";

const traverse = (typeof _traverse === "function" ? _traverse : (_traverse as any).default) as typeof _traverse;

export interface CallSite {
  /** The file that contains the call */
  callerFile: string;
  /** The function being called */
  calledFunction: string;
  /** Line number of the call */
  line: number;
}

/**
 * Scan a source file for import/require statements and function call sites.
 * Returns all call sites found that reference imported symbols.
 */
export function findCallSites(source: string, file: string): CallSite[] {
  const callSites: CallSite[] = [];

  let ast;
  try {
    ast = parser.parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx", "decorators-legacy", "classProperties"],
      errorRecovery: true,
    });
  } catch {
    return [];
  }

  // Track imported/required symbols: name → source module
  const importedSymbols = new Map<string, string>();

  traverse(ast, {
    // import { foo } from './module'
    ImportDeclaration(nodePath) {
      const source = nodePath.node.source.value;
      for (const spec of nodePath.node.specifiers) {
        importedSymbols.set(spec.local.name, source);
      }
    },

    // const { foo } = require('./module')
    VariableDeclarator(nodePath) {
      if (
        nodePath.node.init?.type === "CallExpression" &&
        nodePath.node.init.callee.type === "Identifier" &&
        nodePath.node.init.callee.name === "require" &&
        nodePath.node.init.arguments[0]?.type === "StringLiteral"
      ) {
        const source = nodePath.node.init.arguments[0].value;
        if (nodePath.node.id.type === "ObjectPattern") {
          for (const prop of nodePath.node.id.properties) {
            if (prop.type === "ObjectProperty" && prop.key.type === "Identifier") {
              importedSymbols.set(prop.key.name, source);
            }
          }
        } else if (nodePath.node.id.type === "Identifier") {
          importedSymbols.set(nodePath.node.id.name, source);
        }
      }
    },

    // Track function calls
    CallExpression(nodePath) {
      let functionName: string | null = null;

      if (nodePath.node.callee.type === "Identifier") {
        functionName = nodePath.node.callee.name;
      } else if (
        nodePath.node.callee.type === "MemberExpression" &&
        nodePath.node.callee.property.type === "Identifier"
      ) {
        functionName = nodePath.node.callee.property.name;
      }

      if (functionName) {
        callSites.push({
          callerFile: file,
          calledFunction: functionName,
          line: nodePath.node.loc?.start.line ?? 0,
        });
      }
    },
  });

  return callSites;
}

/**
 * Build a map of function → calling files from a set of source files.
 */
export function buildDependencyGraph(
  fileSources: Map<string, string>
): Map<string, CallSite[]> {
  const graph = new Map<string, CallSite[]>();

  for (const [file, source] of fileSources) {
    const ext = path.extname(file).toLowerCase();
    if (![".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"].includes(ext)) continue;

    const callSites = findCallSites(source, file);
    for (const site of callSites) {
      const existing = graph.get(site.calledFunction) ?? [];
      existing.push(site);
      graph.set(site.calledFunction, existing);
    }
  }

  return graph;
}
