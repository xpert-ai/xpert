#!/usr/bin/env node

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = '/Users/xpertai03/GitHub/xpert';
const includedExtensions = new Set(['.html', '.ts']);
const skipDirs = new Set(['.git', 'dist', 'node_modules', '.nx', 'coverage']);

const legacyPrefix = 'mat';
const legacyButtonSource = ['@angular', 'material', 'button'].join('/');
const legacyButtonModule = ['Mat', 'Button', 'Module'].join('');
const materialButtonVariants = [
  ['raised', 'button'],
  ['flat', 'button'],
  ['stroked', 'button'],
  ['icon', 'button'],
  ['mini', 'fab'],
  ['button'],
  ['fab'],
].map((parts) => parts.join('-'));

const variantConfig = {
  button: { zType: 'ghost' },
  'raised-button': { zType: 'default' },
  'flat-button': { zType: 'secondary', zTypeWhenColor: 'default' },
  'stroked-button': { zType: 'outline' },
  'icon-button': { zType: 'ghost', zSize: 'icon', zShape: 'circle', iconOnly: true },
  fab: { zType: 'default', zSize: 'icon-lg', zShape: 'circle', iconOnly: true },
  'mini-fab': { zType: 'default', zSize: 'icon-sm', zShape: 'circle', iconOnly: true },
};

const materialImportPattern = new RegExp(
  `^import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${escapeRegex(legacyButtonSource)}['"]\\s*;?$`,
  'gm',
);
const zardImportPattern =
  /^import\s*\{([^}]*)\}\s*from\s*['"]@xpert-ai\/headless-ui['"]\s*;?$/gm;
const importStatementPattern = /^import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\n?/gm;
const buttonTagPattern = /<(button|a)\b([^<>]*)>/g;

let updatedFiles = 0;

walk(rootDir);
console.log(`Updated ${updatedFiles} files`);

function walk(dirPath) {
  for (const entry of readdirSync(dirPath)) {
    if (skipDirs.has(entry)) {
      continue;
    }

    const fullPath = path.join(dirPath, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!includedExtensions.has(path.extname(fullPath))) {
      continue;
    }

    const original = readFileSync(fullPath, 'utf8');
    const migrated = migrateFile(original, fullPath);
    if (migrated !== original) {
      writeFileSync(fullPath, migrated);
      updatedFiles += 1;
    }
  }
}

function migrateFile(content, filePath) {
  let next = content.replace(buttonTagPattern, (match, tagName, attrs) =>
    migrateButtonTag(tagName, attrs),
  );

  if (path.extname(filePath) === '.ts') {
    next = migrateTypeScriptImports(next);
  }

  return next;
}

function migrateButtonTag(tagName, attrs) {
  const variant = materialButtonVariants.find((item) =>
    new RegExp(`(^|\\s)${legacyPrefix}-${escapeRegex(item)}(?=(\\s|>|$))`).test(attrs),
  );

  if (!variant) {
    return `<${tagName}${attrs}>`;
  }

  let tag = `<${tagName}${attrs}>`;
  const config = variantConfig[variant];
  const hasColorInput = /\s(?:color|\[color\])\s*=/.test(tag);

  for (const materialVariant of materialButtonVariants) {
    tag = removeAttribute(tag, `${legacyPrefix}-${materialVariant}`);
  }

  tag = removeAttribute(tag, 'disableRipple');
  tag = removeAttribute(tag, '[disableRipple]');
  tag = replaceAttributeName(tag, '[loading]', '[zLoading]');
  tag = replaceAttributeName(tag, 'loading', 'zLoading');
  tag = rewriteClassAttribute(tag, config.iconOnly);

  const additions = [];
  if (!hasAttribute(tag, 'z-button')) {
    additions.push('z-button');
  }
  if (!hasAttribute(tag, 'zType')) {
    additions.push(`zType="${hasColorInput && config.zTypeWhenColor ? config.zTypeWhenColor : config.zType}"`);
  }
  if (config.zSize && !hasAttribute(tag, 'zSize')) {
    additions.push(`zSize="${config.zSize}"`);
  }
  if (config.zShape && !hasAttribute(tag, 'zShape')) {
    additions.push(`zShape="${config.zShape}"`);
  }

  if (additions.length) {
    tag = tag.replace(new RegExp(`^<${tagName}`), `<${tagName} ${additions.join(' ')}`);
  }

  return normalizeWhitespace(tag);
}

function migrateTypeScriptImports(content) {
  let next = content;

  next = next.replace(materialImportPattern, '');
  next = next.replace(
    new RegExp(`^import\\s*\\{[^}]*\\}\\s*from\\s*['"]${escapeRegex(legacyButtonSource)}['"]\\s*;?\\r?$`, 'gm'),
    '',
  );

  if (!next.includes(legacyButtonModule) && !next.includes('ZardButtonComponent')) {
    return next;
  }

  next = next.replace(new RegExp(`\\b${legacyButtonModule}\\b`, 'g'), 'ZardButtonComponent');

  if (!next.includes('ZardButtonComponent')) {
    return next;
  }

  if (zardImportPattern.test(next)) {
    zardImportPattern.lastIndex = 0;
    return next.replace(zardImportPattern, (_match, specifiers) => {
      const names = new Set(parseImportSpecifiers(specifiers));
      names.add('ZardButtonComponent');
      return `import { ${Array.from(names).sort().join(', ')} } from '@xpert-ai/headless-ui'\n`;
    });
  }

  zardImportPattern.lastIndex = 0;

  const importMatches = Array.from(next.matchAll(importStatementPattern));
  const zardImport = `import { ZardButtonComponent } from '@xpert-ai/headless-ui'\n`;
  if (!importMatches.length) {
    return normalizeImportSpacing(`${zardImport}${next}`);
  }

  const lastImport = importMatches.at(-1);
  const insertAt = lastImport.index + lastImport[0].length;
  return normalizeImportSpacing(`${next.slice(0, insertAt)}${zardImport}${next.slice(insertAt)}`);
}

function rewriteClassAttribute(tag, iconOnly) {
  return tag.replace(/\bclass\s*=\s*(["'])([\s\S]*?)\1/g, (_match, quote, classValue) => {
    const nextTokens = [];
    const seen = new Set();

    for (const token of classValue.split(/\s+/)) {
      if (!token) {
        continue;
      }

      if (token === 'ngm-rounded-full') {
        if (!iconOnly) {
          addClassToken(nextTokens, seen, 'rounded-full');
        }
        continue;
      }

      addClassToken(nextTokens, seen, token);
    }

    return `class=${quote}${nextTokens.join(' ')}${quote}`;
  });
}

function addClassToken(tokens, seen, token) {
  if (seen.has(token)) {
    return;
  }

  seen.add(token);
  tokens.push(token);
}

function removeAttribute(tag, attributeName) {
  const pattern = new RegExp(
    `\\s+${escapeRegex(attributeName)}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?`,
    'g',
  );
  return tag.replace(pattern, '');
}

function replaceAttributeName(tag, attributeName, nextName) {
  if (attributeName.startsWith('[')) {
    const pattern = new RegExp(`(\\s+)${escapeRegex(attributeName)}(?=\\s*=)`, 'g');
    return tag.replace(pattern, `$1${nextName}`);
  }

  const pattern = new RegExp(`(\\s+)${escapeRegex(attributeName)}(?=(\\s|>|=))`, 'g');
  return tag.replace(pattern, (match, spacing) => {
    if (match.includes(nextName)) {
      return match;
    }

    return `${spacing}${nextName}`;
  });
}

function hasAttribute(tag, attributeName) {
  return new RegExp(`(^|\\s)${escapeRegex(attributeName)}(?=(\\s|>|=))`).test(tag);
}

function parseImportSpecifiers(specifiers) {
  return specifiers
    .split(',')
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function normalizeWhitespace(tag) {
  return tag
    .replace(/\s+>/g, '>')
    .replace(/\s{2,}/g, ' ')
    .replace(/<(\w+)\s+/g, '<$1 ');
}

function normalizeImportSpacing(content) {
  return content
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
