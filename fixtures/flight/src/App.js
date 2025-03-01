import * as React from 'react';

import { SceneView } from "navigation-react";
import RootProvider from "./RootProvider.js";
import Person from './Person.js';
import People from './People.js';

export default async function App({url}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Navigation React</title>
      </head>
      <body>
        <RootProvider url={url}>
          <SceneView active="people">
            <People />
          </SceneView>
          <SceneView active="person" dataKeyDeps={['id']}>
            <Person />
          </SceneView>
        </RootProvider>
      </body>
    </html>
  );
}
