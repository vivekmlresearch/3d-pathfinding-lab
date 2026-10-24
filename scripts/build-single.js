#!/usr/bin/env node
'use strict';
/*
 * Inlines docs/css/style.css, docs/js/algorithms.js and docs/js/app.js into one HTML fragment
 * (dist/pathfinding-lab.html). The fragment has no <!doctype>/<html>/<head>/<body>, so it can be
 * dropped into hosts that supply their own page skeleton. three.js still loads from the CDN.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('docs/index.html');
const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [, 'Cube Pathfinding Lab'])[1];
const fonts = (html.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/) || [''])[0];
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));

const css = read('docs/css/style.css');
const inline = (src) => '<script>\n' + read(src).replace(/<\/script/gi, '<\\/script') + '\n</script>';

const out = body
  .replace(/\s*<a href="demos\/[^"]*">[^<]*<\/a>/g, '')
  .replace('<script src="js/algorithms.js"></script>', () => inline('docs/js/algorithms.js'))
  .replace('<script src="js/app.js"></script>', () => inline('docs/js/app.js'));

const frag = '<title>' + title + '</title>\n' +
  '<meta name="claude:viewport-fit-sides" content="cover">\n' +
  fonts + '\n<style>\n' + css + '\n</style>\n' + out.trim() + '\n';

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const file = path.join(root, 'dist', 'pathfinding-lab.html');
fs.writeFileSync(file, frag);
console.log('wrote', path.relative(process.cwd(), file), (frag.length / 1024).toFixed(0) + ' KB');
