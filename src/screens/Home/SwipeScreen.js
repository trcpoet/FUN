import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Swiper from 'react-native-deck-swiper';

const dummyUsers = [
  { name: 'Jordan', sport: 'Basketball' },
  { name: 'Alex', sport: 'Soccer' },
  { name: 'Sam', sport: 'Tennis' },
];

const SwipeScreen = () => {
  const [cards, setCards] = useState(dummyUsers);

  return (
    <View style={styles.container}>
      <Swiper
        cards={cards}
        renderCard={(card) => (
          <View style={styles.card}>
            <Text style={styles.text}>{card.name}</Text>
            <Text>{card.sport}</Text>
          </View>
        )}
        onSwipedRight={(cardIndex) => {
          console.log(`Liked: ${cards[cardIndex].name}`);
        }}
        onSwipedLeft={(cardIndex) => {
          console.log(`Skipped: ${cards[cardIndex].name}`);
        }}
        backgroundColor="transparent"
        stackSize={3}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, marginTop: 100 },
  card: {
    height: 400,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
  },
  text: { fontSize: 22, fontWeight: 'bold' },
});

export default SwipeScreen;
