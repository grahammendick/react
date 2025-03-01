'use client'
import * as React from 'react';
import { useMemo } from "react";
import { StateNavigator, HTML5HistoryManager } from 'navigation';
import { NavigationHandler } from "navigation-react";
import stateNavigator from "./stateNavigator.js";

const NavigationProvider = ({url, children}) => {
  const navigator = useMemo(() => {
    const navigator = new StateNavigator(stateNavigator, new HTML5HistoryManager());
    navigator.navigateLink(url);
    return navigator;
  }, []);
  return (
    <NavigationHandler stateNavigator={navigator} fetchRSC={null}>
      {children}
    </NavigationHandler>
  )
}

export default NavigationProvider;
