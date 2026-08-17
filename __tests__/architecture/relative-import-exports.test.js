import fs from 'node:fs';
import path from 'node:path';
import babel from '@babel/core';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = process.cwd();
const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.expo',
  '.kiro',
  '__tests__',
  'build',
  'coverage',
  'dist',
  'docs',
  'node_modules',
  'patchs',
]);

const getNodeName = (node) => node?.name ?? node?.value ?? null;

const collectBindingNames = (node, result) => {
  if (!node) return;
  if (node.type === 'Identifier') {
    result.add(node.name);
    return;
  }
  if (node.type === 'ObjectPattern') {
    node.properties.forEach((property) => collectBindingNames(property.value || property.argument, result));
    return;
  }
  if (node.type === 'ArrayPattern') {
    node.elements.forEach((element) => collectBindingNames(element, result));
    return;
  }
  if (node.type === 'RestElement') {
    collectBindingNames(node.argument, result);
    return;
  }
  if (node.type === 'AssignmentPattern') {
    collectBindingNames(node.left, result);
  }
};

const collectProductionJavaScript = (directory, result = []) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectProductionJavaScript(fullPath, result);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      result.push(fullPath);
    }
  }
  return result;
};

const parseModule = (filePath) => babel.parseSync(fs.readFileSync(filePath, 'utf8'), {
  filename: filePath,
  babelrc: false,
  configFile: false,
  sourceType: 'unambiguous',
  parserOpts: { plugins: ['jsx'] },
});

const resolveRelativeModule = (importerPath, source) => {
  if (!source.startsWith('.')) return null;
  const unresolved = path.resolve(path.dirname(importerPath), source);
  const candidates = [
    unresolved,
    `${unresolved}.js`,
    `${unresolved}.web.js`,
    `${unresolved}.native.js`,
    `${unresolved}.ios.js`,
    `${unresolved}.android.js`,
    `${unresolved}.json`,
    path.join(unresolved, 'index.js'),
    path.join(unresolved, 'index.web.js'),
    path.join(unresolved, 'index.native.js'),
    path.join(unresolved, 'index.json'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || unresolved;
};

const relativePath = (filePath) => path.relative(PROJECT_ROOT, filePath).replaceAll(path.sep, '/');

describe('relative ES module contracts', () => {
  it('every production named import is exported by its target module', () => {
    const files = collectProductionJavaScript(PROJECT_ROOT);
    const modules = new Map(files.map((filePath) => [filePath, parseModule(filePath)]));
    const directExports = new Map();
    const starExports = new Map();

    for (const [filePath, ast] of modules) {
      const names = new Set();
      const stars = [];

      for (const node of ast.program.body) {
        if (node.type === 'ExportAllDeclaration') {
          const target = resolveRelativeModule(filePath, node.source.value);
          if (target) stars.push(target);
          continue;
        }
        if (node.type !== 'ExportNamedDeclaration') continue;

        const declaration = node.declaration;
        if (declaration?.type === 'FunctionDeclaration' || declaration?.type === 'ClassDeclaration') {
          if (declaration.id) names.add(declaration.id.name);
        } else if (declaration?.type === 'VariableDeclaration') {
          declaration.declarations.forEach((item) => collectBindingNames(item.id, names));
        }
        node.specifiers.forEach((specifier) => {
          const exportedName = getNodeName(specifier.exported);
          if (exportedName) names.add(exportedName);
        });
      }

      directExports.set(filePath, names);
      starExports.set(filePath, stars);
    }

    const hasNamedExport = (filePath, exportName, visited = new Set()) => {
      if (visited.has(filePath)) return false;
      const nextVisited = new Set(visited).add(filePath);
      if (directExports.get(filePath)?.has(exportName)) return true;
      return (starExports.get(filePath) || []).some((target) =>
        modules.has(target) && hasNamedExport(target, exportName, nextVisited));
    };

    const issues = [];
    const checkNamedReference = ({ importerPath, source, target, importedName, line, kind }) => {
      if (!fs.existsSync(target)) {
        issues.push(`${relativePath(importerPath)}:${line} ${kind} ${source}: module not found`);
        return;
      }
      if (!target.endsWith('.js') || !modules.has(target)) return;
      if (!hasNamedExport(target, importedName)) {
        issues.push(
          `${relativePath(importerPath)}:${line} ${kind} { ${importedName} } from ${source}: `
          + `${relativePath(target)} does not export ${importedName}`,
        );
      }
    };

    for (const [filePath, ast] of modules) {
      for (const node of ast.program.body) {
        if (node.type === 'ImportDeclaration') {
          const source = node.source.value;
          const target = resolveRelativeModule(filePath, source);
          if (!target) continue;
          const namedImports = node.specifiers.filter((specifier) => specifier.type === 'ImportSpecifier');
          if (namedImports.length === 0 && !fs.existsSync(target)) {
            issues.push(`${relativePath(filePath)}:${node.loc.start.line} import ${source}: module not found`);
          }
          namedImports.forEach((specifier) => checkNamedReference({
            importerPath: filePath,
            source,
            target,
            importedName: getNodeName(specifier.imported),
            line: node.loc.start.line,
            kind: 'imports',
          }));
        }

        if (node.type === 'ExportNamedDeclaration' && node.source) {
          const source = node.source.value;
          const target = resolveRelativeModule(filePath, source);
          if (!target) continue;
          node.specifiers.forEach((specifier) => checkNamedReference({
            importerPath: filePath,
            source,
            target,
            importedName: getNodeName(specifier.local),
            line: node.loc.start.line,
            kind: 're-exports',
          }));
        }
      }
    }

    expect(issues, issues.join('\n')).toEqual([]);
  });
});
