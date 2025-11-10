import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';

import SwipeScreen from '../screens/Home/SwipeScreen';
import MapScreen from '../screens/Map/MapScreen';
import FeedScreen from '../screens/Feed/FeedScreen';

const Tab = createBottomTabNavigator();

const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen name="Swipe" component={SwipeScreen} />
        <Tab.Screen name="Map" component={MapScreen} />
        <Tab.Screen name="Feed" component={FeedScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
