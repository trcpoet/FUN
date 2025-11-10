import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';

const dummyUsers = [
  { id: 1, name: 'Leo', latitude: 37.78825, longitude: -122.4324 },
  { id: 2, name: 'Sky', latitude: 37.78925, longitude: -122.4314 },
];

const MapScreen = () => {
  const [location, setLocation] = useState(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
    })();
  }, []);

  return (
    <View style={styles.container}>
      {location ? (
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          <Marker
            coordinate={{
              latitude: location.latitude,
              longitude: location.longitude,
            }}
            title="You"
          />
          {dummyUsers.map((user) => (
            <Marker
              key={user.id}
              coordinate={{ latitude: user.latitude, longitude: user.longitude }}
              title={user.name}
            />
          ))}
        </MapView>
      ) : (
        <Text>Loading map...</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});

export default MapScreen;
