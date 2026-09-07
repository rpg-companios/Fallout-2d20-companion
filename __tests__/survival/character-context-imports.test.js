import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseSync } from '@babel/core';
import jsxPlugin from '@babel/plugin-transform-react-jsx';
import ts from 'typescript';

// Регрессия патча 198: в CharacterContext был импортирован несуществующий
// getCharacterArchetype (функция зовётся getCharacterType) — эффект
// инициализации выживания падал TypeError при загрузке сейва и ломал
// загрузку дальше по цепочке. Импортировать сам модуль в vitest нельзя
// (react-native — Flow), поэтому проверяем целостность именованных
// импортов статически: каждое имя из локального '../…' должно быть
// экспортировано целевым файлом. С патча 206 целевой модуль может быть
// .ts (домен выживания) — такие файлы разбираем TypeScript-парсером.

const ROOT = path.resolve(__dirname, '../..');
const FILE = path.join(ROOT, 'components/CharacterContext.js');

const parse = (file) => parseSync(fs.readFileSync(file, 'utf8'), {
    filename: file,
    babelrc: false,
    configFile: false,
    sourceType: 'module',
    plugins: [jsxPlugin],
    parserOpts: { allowReturnOutsideFunction: true },
});

const exportedNames = (ast) => {
    const names = new Set();
    for (const node of ast.program.body) {
        if (node.type === 'ExportNamedDeclaration') {
            if (node.specifiers.length) {
                node.specifiers.forEach((s) => names.add(s.exported.name));
            }
            const decl = node.declaration;
            if (decl) {
                if (decl.id) names.add(decl.id.name); // function/class
                if (decl.declarations) {
                    decl.declarations.forEach((d) => {
                        if (d.id.type === 'Identifier') names.add(d.id.name);
                    });
                }
            }
        }
        if (node.type === 'ExportDefaultDeclaration') names.add('default');
    }
    return names;
};

const exportedNamesFromTs = (file) => {
    const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );
    const names = new Set();
    const collect = (node) => {
        if (ts.isExportDeclaration(node)) {
            if (node.exportClause && ts.isNamedExports(node.exportClause)) {
                node.exportClause.elements.forEach((el) => names.add(el.name.text));
            }
        } else if (ts.isExportAssignment(node)) {
            names.add('default');
        } else if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
            if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
                if (node.name) names.add(node.name.text);
            } else if (ts.isVariableStatement(node)) {
                node.declarationList.declarations.forEach((d) => {
                    if (ts.isIdentifier(d.name)) names.add(d.name.text);
                });
            } else if (
                ts.isInterfaceDeclaration(node)
                || ts.isTypeAliasDeclaration(node)
                || ts.isEnumDeclaration(node)
            ) {
                names.add(node.name.text);
            }
        }
        ts.forEachChild(node, collect);
    };
    collect(source);
    return names;
};

// Целевой модуль импорта: .js или (с патча 206) .ts.
const resolveTarget = (base) => {
    if (fs.existsSync(`${base}.js`)) return { file: `${base}.js`, isTs: false };
    if (fs.existsSync(`${base}.ts`)) return { file: `${base}.ts`, isTs: true };
    return null;
};

describe('CharacterContext: целостность именованных импортов', () => {
    it('каждое импортируемое имя существует в целевом локальном модуле', () => {
        const ast = parse(FILE);
        const problems = [];
        for (const node of ast.program.body) {
            if (node.type !== 'ImportDeclaration') continue;
            if (!node.source.value.startsWith('.')) continue; // только локальные
            const target = resolveTarget(path.resolve(path.dirname(FILE), node.source.value));
            if (!target) continue; // индексы/пакеты — не наш случай
            const available = target.isTs
                ? exportedNamesFromTs(target.file)
                : exportedNames(parse(target.file));
            for (const spec of node.specifiers) {
                if (spec.type !== 'ImportSpecifier') continue;
                if (!available.has(spec.imported.name)) {
                    problems.push(`${node.source.value}: ${spec.imported.name}`);
                }
            }
        }
        expect(problems).toEqual([]);
    });
});
