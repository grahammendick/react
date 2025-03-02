'use strict';

// This is a server to host data-local resources like databases and RSC

const path = require('path');
const url = require('url');

const register = require('react-server-dom-webpack/node-register');
register();

const babelRegister = require('@babel/register');
babelRegister({
  babelrc: false,
  ignore: [
    /\/(build|node_modules)\//,
    function (file) {
      if ((path.dirname(file) + '/').startsWith(__dirname + '/')) {
        // Ignore everything in this folder
        // because it's a mix of CJS and ESM
        // and working with raw code is easier.
        return true;
      }
      return false;
    },
  ],
  presets: ['@babel/preset-react'],
  plugins: ['@babel/transform-modules-commonjs'],
  sourceMaps: process.env.NODE_ENV === 'development' ? 'inline' : false,
});

if (typeof fetch === 'undefined') {
  // Patch fetch for earlier Node versions.
  global.fetch = require('undici').fetch;
}

const express = require('express');
const bodyParser = require('body-parser');
const busboy = require('busboy');
const app = express();
const compress = require('compression');
const {Readable} = require('node:stream');

const nodeModule = require('node:module');

app.use(compress());
app.use(express.json());

// Application

const {readFile} = require('fs').promises;

const React = require('react');
const {StateNavigator} = require('navigation');
const stateNavigator = require('../src/stateNavigator.js');

async function renderApp(req, res, el) {
  const {renderToPipeableStream} = await import(
    'react-server-dom-webpack/server'
  );
  const m = await import('../src/App.js');
  const {NavigationHandler} = await import('navigation-react');

  let moduleMap;
  let mainCSSChunks;
  if (process.env.NODE_ENV === 'development') {
    // Read the module map from the HMR server in development.
    moduleMap = await (
      await fetch('http://localhost:3000/react-client-manifest.json')
    ).json();
    mainCSSChunks = (
      await (
        await fetch('http://localhost:3000/entrypoint-manifest.json')
      ).json()
    ).main.css;
  } else {
    // Read the module map from the static build in production.
    moduleMap = JSON.parse(
      await readFile(
        path.resolve(__dirname, `../build/react-client-manifest.json`),
        'utf8'
      )
    );
    mainCSSChunks = JSON.parse(
      await readFile(
        path.resolve(__dirname, `../build/entrypoint-manifest.json`),
        'utf8'
      )
    ).main.css;
  }
  const navigator = new StateNavigator(stateNavigator.default);
  navigator.navigateLink(req.url);
  const root = React.createElement(
    React.Fragment,
    null,
    // Prepend the App's tree with stylesheets required for this entrypoint.
    mainCSSChunks.map(filename =>
      React.createElement('link', {
        rel: 'stylesheet',
        href: '/' + filename,
        precedence: 'default',
        key: filename,
      })
    ),
    React.createElement(
      NavigationHandler,
      {stateNavigator: navigator},
      el)
  );
  const {pipe} = renderToPipeableStream(req.accepts('text/html') ? {root} : root, moduleMap);
  pipe(res);
}

if (process.env.NODE_ENV === 'development') {
  const rootDir = path.resolve(__dirname, '../');

  app.get('/source-maps', async function (req, res, next) {
    try {
      res.set('Content-type', 'application/json');
      let requestedFilePath = req.query.name;

      let isCompiledOutput = false;
      if (requestedFilePath.startsWith('file://')) {
        // We assume that if it was prefixed with file:// it's referring to the compiled output
        // and if it's a direct file path we assume it's source mapped back to original format.
        isCompiledOutput = true;
        requestedFilePath = url.fileURLToPath(requestedFilePath);
      }

      const relativePath = path.relative(rootDir, requestedFilePath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        // This is outside the root directory of the app. Forbid it to be served.
        res.status = 403;
        res.write('{}');
        res.end();
        return;
      }

      const sourceMap = nodeModule.findSourceMap(requestedFilePath);
      let map;
      if (requestedFilePath.startsWith('node:')) {
        // This is a node internal. We don't include any source code for this but we still
        // generate a source map for it so that we can add it to an ignoreList automatically.
        map = {
          version: 3,
          // We use the node:// protocol convention to teach Chrome DevTools that this is
          // on a different protocol and not part of the current page.
          sources: ['node:///' + requestedFilePath.slice(5)],
          sourcesContent: ['// Node Internals'],
          mappings: 'AAAA',
          ignoreList: [0],
          sourceRoot: '',
        };
      } else if (!sourceMap || !isCompiledOutput) {
        // If a file doesn't have a source map, such as this file, then we generate a blank
        // source map that just contains the original content and segments pointing to the
        // original lines. If a line number points to uncompiled output, like if source mapping
        // was already applied we also use this path.
        const sourceContent = await readFile(requestedFilePath, 'utf8');
        const lines = sourceContent.split('\n').length;
        // We ensure to absolute
        const sourceURL = url.pathToFileURL(requestedFilePath);
        map = {
          version: 3,
          sources: [sourceURL],
          sourcesContent: [sourceContent],
          // Note: This approach to mapping each line only lets you jump to each line
          // not jump to a column within a line. To do that, you need a proper source map
          // generated for each parsed segment or add a segment for each column.
          mappings: 'AAAA' + ';AACA'.repeat(lines - 1),
          sourceRoot: '',
          // Add any node_modules to the ignore list automatically.
          ignoreList: requestedFilePath.includes('node_modules')
            ? [0]
            : undefined,
        };
      } else {
        // We always set prepareStackTrace before reading the stack so that we get the stack
        // without source maps applied. Therefore we have to use the original source map.
        // If something read .stack before we did, we might observe the line/column after
        // source mapping back to the original file. We use the isCompiledOutput check above
        // in that case.
        map = sourceMap.payload;
      }
      res.write(JSON.stringify(map));
      res.end();
    } catch (x) {
      res.status = 500;
      res.write('{}');
      res.end();
      console.error(x);
    }
  });
}

app.get('*', async function (req, res) {
  const m = await import('../src/App.js');
  const App = m.default.default || m.default;
  await renderApp(req, res, React.createElement(App, {url: req.url}));
});


app.post('*', async function (req, res) {
  const sceneViews = {
    people: await import('../src/People.js'),
    person: await import('../src/Person.js'),
    friends: await import('../src/Friends.js')
  };
  const View = sceneViews[req.body.sceneViewKey].default;
  await renderApp(req, res, React.createElement(View));
});

app.listen(3001, () => {
  console.log('Regional Flight Server listening on port 3001...');
});

app.on('error', function (error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  switch (error.code) {
    case 'EACCES':
      console.error('port 3001 requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error('Port 3001 is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
});
