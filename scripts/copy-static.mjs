/**
 * Post-build script: copies static assets (manifest, HTML, CSS, images, locales)
 * from src/ to dist/ after Vite bundles the JS files.
 */
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = 'src';
const DIST = 'dist';

// Files to copy directly
const STATIC_FILES = [
  'manifest.json',
  'popup.html',
  'popup.css',
  'popup.js',
  'options.html',
  'options.css',
  'options.js',
  'offscreen.html',
  'ui.css',
  'content.js',
  'mainWorld.js',
  'optimize.png',
];

function copyDir(srcDir, destDir) {
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    const srcPath = join(srcDir, entry);
    const destPath = join(destDir, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

// Copy static files
for (const file of STATIC_FILES) {
  const src = join(SRC, file);
  const dest = join(DIST, file);
  if (existsSync(src)) {
    copyFileSync(src, dest);
    console.log(`  ✓ ${file}`);
  } else {
    console.warn(`  ⚠ ${file} not found, skipping`);
  }
}

// Copy _locales directory
const localesSrc = join(SRC, '_locales');
if (existsSync(localesSrc)) {
  copyDir(localesSrc, join(DIST, '_locales'));
  console.log('  ✓ _locales/');
}

console.log('✅ Static assets copied to dist/');
