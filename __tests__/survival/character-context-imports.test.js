import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseSync } from '@babel/core';
import jsxPlugin from '@babel/plugin-transform-react-jsx';

// Регрессия патча 198: в CharacterContext был импортирован несуществующий
// getCharacterArchetype (функция зовётся getCharacterType) — эффект
// инициализации выживания падал TypeError при загрузке сейва и ломал
// загрузку дальше по цепочке. Импортировать сам модуль в vitest нельзя
// (react-native — Flow), поэтому проверяем целостность именованных
// импортов статически: каждое имя из локального '../…' должно быть
// экспортировано целевым файлом.

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

describe('CharacterContext: целостность именованных импортов', () => {
    it('каждое импортируемое имя существует в целевом локальном модуле', () => {
        const ast = parse(FILE);
        const problems = [];
        for (const node of ast.program.body) {
            if (node.type !== 'ImportDeclaration') continue;
            if (!node.source.value.startsWith('.')) continue; // только локальные
            const target = path.resolve(path.dirname(FILE), node.source.value) + '.js';
            if (!fs.existsSync(target)) continue; // индексы/пакеты — не наш случай
            const available = exportedNames(parse(target));
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
