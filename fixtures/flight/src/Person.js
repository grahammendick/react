import * as React from 'react';
import { getPerson } from './data.js';
import { SceneView, NavigationBackLink, useNavigationEvent } from 'navigation-react';
import Friends from "./Friends.js";
import { Suspense } from 'react';

const Person = async () => {
  return (
    <Suspense fallback={<h2>Loading...</h2>}>
      <Details />
    </Suspense>
  )
}

const Details = async () => {
  const {data} = useNavigationEvent();
  const {name, dateOfBirth, email, phone} = await getPerson(data.id);
  return (
    <>
      <h1>Person</h1>
      <div>
        <NavigationBackLink distance={1}>Person Search</NavigationBackLink>
        <div>
          <h2>{name}</h2>
          <div>Date of Birth</div>
          <div>{dateOfBirth}</div>
          <div>Email</div>
          <div>{email}</div>
          <div>Phone</div>
          <div>{phone}</div>
        </div>
        <Suspense fallback={<h2>Loading...</h2>}>
        <SceneView active="person" name="friends">
          <Friends />
        </SceneView>
        </Suspense>
      </div>
    </>
  )
}


export default Person;
